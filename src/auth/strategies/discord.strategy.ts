import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-discord';
import { AuthService } from '../auth.service.js';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  private readonly logger = new Logger(DiscordStrategy.name);

  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('OAUTH_DISCORD_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('OAUTH_DISCORD_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('OAUTH_DISCORD_CALLBACK_URL'),
      scope: ['identify', 'email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    this.logger.debug(
      `Discord raw profile: ${JSON.stringify(profile, null, 2)}`,
    );

    const profilePicture = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : undefined;

    const normalized = {
      id: profile.id,
      email: profile.email ?? '',
      username: profile.username,
      firstName: profile.global_name ?? profile.username,
      lastName: '',
      profilePicture,
    };

    this.logger.debug(
      `Discord normalized profile sent to handleOAuthLogin: ${JSON.stringify(normalized, null, 2)}`,
    );

    return this.authService.handleOAuthLogin('discord', normalized);
  }
}
