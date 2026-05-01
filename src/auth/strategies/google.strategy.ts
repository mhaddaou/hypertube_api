import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
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
    return this.authService.handleOAuthLogin('google', {
      id: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      username: profile.displayName.replace(/\s+/g, '_').toLowerCase(),
      firstName: profile.name?.givenName ?? profile.displayName,
      lastName: profile.name?.familyName ?? '',
      profilePicture: profile.photos?.[0]?.value,
    });
  }
}
