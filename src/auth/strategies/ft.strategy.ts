import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-42';
import { AuthService } from '../auth.service.js';

@Injectable()
export class FtStrategy extends PassportStrategy(Strategy, '42') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('OAUTH_42_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('OAUTH_42_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('OAUTH_42_CALLBACK_URL'),
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    const image = profile._json?.image;
    const profilePicture =
      image?.versions?.medium ?? image?.versions?.large ?? image?.link ?? undefined;

    return this.authService.handleOAuthLogin('42', {
      id: profile.id,
      email: profile._json?.email ?? profile.emails?.[0]?.value ?? '',
      username: profile.username,
      firstName: profile._json?.first_name ?? profile.name?.givenName ?? profile.username,
      lastName: profile._json?.last_name ?? profile.name?.familyName ?? '',
      profilePicture,
    });
  }
}
