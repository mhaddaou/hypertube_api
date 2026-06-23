import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

interface JwtPayload {
  sub: string;
  username: string;
  type: 'user' | 'client';
}

function extractJwtFromAuthorizationHeader(request: Request): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) return token;

  return authorization;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractJwtFromAuthorizationHeader,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException();

    if (payload.type === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { refreshToken: true },
      });

      if (!user || user.refreshToken === null) {
        throw new UnauthorizedException('Session expired');
      }
    }

    return {
      userId: payload.sub,
      username: payload.username,
      type: payload.type,
    };
  }
}

