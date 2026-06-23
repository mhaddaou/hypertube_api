import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';

type JwtExpiresIn =
  | number
  | `${number}`
  | `${number}ms`
  | `${number}s`
  | `${number}m`
  | `${number}h`
  | `${number}d`
  | `${number}w`
  | `${number}y`;

interface OAuthProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
}

interface UserJwtPayload {
  sub: string;
  username: string;
  type: 'user';
}

export interface UserData {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  language: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user_data: UserData;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  async register(dto: RegisterDto) {
    const existingEmail = await this.prisma.user.findFirst({
      where: { email: dto.email, isOauth: false },
    });
    if (existingEmail) throw new ConflictException('Email already in use');

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        isOauth: false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        language: true,
      },
    });

    return user;
  }

  async validateLocalUser(username: string, password: string) {
    const isEmail = username.includes('@');
    const user = isEmail
      ? await this.prisma.user.findFirst({
          where: { email: username, isOauth: false },
        })
      : await this.prisma.user.findUnique({ where: { username } });
    if (!user) return null;

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses OAuth login. Please sign in via 42 or Google.',
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: { id: string; username: string }): Promise<LoginResponse> {
    const tokens = this.generateTokens(user.id, user.username);
    await this.storeRefreshToken(user.id, tokens.refresh_token);
    const user_data = await this.getUserData(user.id);

    return { ...tokens, user_data };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, refreshToken: true },
    });

    if (!user?.refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const valid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!valid)
      throw new UnauthorizedException('Invalid or expired refresh token');

    const tokens = this.generateTokens(user.id, user.username);
    await this.storeRefreshToken(user.id, tokens.refresh_token);
    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async handleOAuthLogin(provider: string, profile: OAuthProfile) {
    this.logger.debug(
      `handleOAuthLogin(${provider}) profile: ${JSON.stringify(profile)}`,
    );

    if (!profile.id || !profile.email) {
      this.logger.warn(
        `OAuth profile missing id/email — provider=${provider} id=${profile.id} email=${profile.email}`,
      );
      throw new UnauthorizedException(
        'OAuth provider did not return a usable profile',
      );
    }

    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId: profile.id } },
      include: { user: true },
    });

    if (existing) {
      this.logger.debug(
        `Existing OAuth account found for ${provider}:${profile.id} → user ${existing.user.id} (${existing.user.email})`,
      );
      if (!existing.user.profilePicture && profile.profilePicture) {
        await this.prisma.user.update({
          where: { id: existing.user.id },
          data: { profilePicture: profile.profilePicture },
        });
        return { ...existing.user, profilePicture: profile.profilePicture };
      }
      return existing.user;
    }

    // OAuth users are always created as a separate User row, even if their email
    // matches an existing local or OAuth account. The partial unique index in
    // the DB allows duplicate emails only when isOauth = true.
    this.logger.debug(
      `Creating new OAuth user for ${provider}:${profile.id} (email=${profile.email})`,
    );
    const username = await this.createUniqueUsername(
      profile.username || profile.email.split('@')[0],
    );

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        profilePicture: profile.profilePicture,
        isOauth: true,
      },
    });

    await this.prisma.oAuthAccount.create({
      data: { provider, providerId: profile.id, userId: user.id },
    });

    return user;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, isOauth: false },
    });
    // Always respond 200 to avoid email enumeration
    if (!user) return;

    const token = uuidv4();
    const hash = await bcrypt.hash(token, 12);
    const exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hash, resetTokenExp: exp },
    });

    await this.mailService.sendPasswordReset(email, token);
  }

  async resetPassword(token: string, newPassword: string) {
    const users = await this.prisma.user.findMany({
      where: { resetTokenHash: { not: null } },
      select: { id: true, resetTokenHash: true, resetTokenExp: true },
    });

    for (const user of users) {
      if (!user.resetTokenHash) continue;
      const match = await bcrypt.compare(token, user.resetTokenHash);
      if (!match) continue;

      if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
        throw new BadRequestException('Password reset token has expired');
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetTokenHash: null, resetTokenExp: null },
      });
      return;
    }

    throw new BadRequestException('Invalid password reset token');
  }

  issueClientToken(client: { clientId: string; name: string }) {
    const payload = { sub: client.clientId, name: client.name, type: 'client' };
    const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
    return { access_token, token_type: 'Bearer', expires_in: 3600 };
  }

  private generateTokens(userId: string, username: string) {
    const payload: UserJwtPayload = { sub: userId, username, type: 'user' };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.config.getOrThrow<JwtExpiresIn>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: this.config.getOrThrow<JwtExpiresIn>('JWT_REFRESH_EXPIRES_IN'),
    });

    return { access_token, refresh_token };
  }

  private verifyRefreshToken(refreshToken: string): UserJwtPayload {
    try {
      const payload = this.jwtService.verify<UserJwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      if (payload.type !== 'user' || !payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }

  private async getUserData(userId: string): Promise<UserData> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
        language: true,
      },
    });

    return user;
  }

  private async createUniqueUsername(base: string) {
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20);
    const root =
      normalized.length >= 3 ? normalized : `user_${normalized || 'oauth'}`;
    let username = root.slice(0, 20);
    let suffix = 0;

    while (await this.prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      const ending = `_${suffix}`;
      username = `${root.slice(0, 20 - ending.length)}${ending}`;
    }

    return username;
  }
}
