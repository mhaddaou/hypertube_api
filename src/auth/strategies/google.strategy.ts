import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('OAUTH_GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('OAUTH_GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('OAUTH_GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    this.logger.debug(
      `Google raw profile: ${JSON.stringify(profile, null, 2)}`,
    );

    const normalized = {
      id: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      username: profile.displayName.replace(/\s+/g, '_').toLowerCase(),
      firstName: profile.name?.givenName ?? profile.displayName,
      lastName: profile.name?.familyName ?? '',
      profilePicture: profile.photos?.[0]?.value,
    };

    this.logger.debug(
      `Google normalized profile sent to handleOAuthLogin: ${JSON.stringify(normalized, null, 2)}`,
    );

    return this.authService.handleOAuthLogin('google', normalized);
  }
}
