import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OAuthTokenDto } from './dto/oauth-token.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { DiscordAuthGuard } from './guards/discord-auth.guard.js';
import { FtAuthGuard } from './guards/ft-auth.guard.js';
import { GoogleAuthGuard } from './guards/google-auth.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import { OAuthClientGuard } from './guards/oauth-client.guard.js';

interface AuthenticatedUser {
  userId: string;
  username: string;
  type: 'user' | 'client';
}

interface OAuthUser {
  id: string;
  username: string;
}

interface LocalAuthRequest extends ExpressRequest {
  user: OAuthUser;
}

interface OAuthAuthRequest extends ExpressRequest {
  user: OAuthUser;
}

interface OAuthClientRequest extends ExpressRequest {
  oauthClient: {
    clientId: string;
    name: string;
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a local user account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginDto })
  @ApiOperation({ summary: 'Login with username and password' })
  login(@Request() req: LocalAuthRequest) {
    return this.authService.login(req.user);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiSecurity('access-token')
  @ApiOperation({ summary: 'Logout the current user' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId);
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Get('42')
  @UseGuards(FtAuthGuard)
  @ApiOperation({ summary: 'Start 42 OAuth login' })
  loginWith42() {}

  @Get('42/callback')
  @UseGuards(FtAuthGuard)
  @ApiOperation({ summary: 'Handle 42 OAuth callback' })
  async callback42(@Request() req: OAuthAuthRequest, @Res() res: Response) {
    return this.redirectWithTokens(req.user, res);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google OAuth login' })
  loginWithGoogle() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async callbackGoogle(@Request() req: OAuthAuthRequest, @Res() res: Response) {
    return this.redirectWithTokens(req.user, res);
  }

  @Get('discord')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Start Discord OAuth login' })
  loginWithDiscord() {}

  @Get('discord/callback')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Handle Discord OAuth callback' })
  async callbackDiscord(@Request() req: OAuthAuthRequest, @Res() res: Response) {
    return this.redirectWithTokens(req.user, res);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a password reset email when the account exists',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message:
        'If an account exists for this email, a reset link has been sent',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password with an email token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successfully' };
  }

  private async redirectWithTokens(user: OAuthUser, res: Response) {
    const { access_token, refresh_token, user_data } =
      await this.authService.login(user);

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const redirectUrl = new URL('/auth/callback', frontendUrl);

    redirectUrl.searchParams.set('access_token', access_token);
    redirectUrl.searchParams.set('refresh_token', refresh_token);
    // base64-encode user_data so it survives URL encoding cleanly
    redirectUrl.searchParams.set(
      'user_data',
      Buffer.from(JSON.stringify(user_data)).toString('base64'),
    );

    return res.redirect(redirectUrl.toString());
  }
}

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('token')
  @HttpCode(200)
  @UseGuards(OAuthClientGuard)
  @ApiBody({ type: OAuthTokenDto })
  @ApiOperation({ summary: 'Issue a client credentials access token' })
  token(@Body() dto: OAuthTokenDto, @Request() req: OAuthClientRequest) {
    if (dto.grant_type !== 'client_credentials') {
      throw new BadRequestException('Unsupported grant_type');
    }

    return this.authService.issueClientToken(req.oauthClient);
  }
}
