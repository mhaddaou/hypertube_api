declare module 'passport-42' {
  import { Strategy as PassportStrategy } from 'passport';
  import { Request } from 'express';

  export interface FtImage {
    link: string | null;
    versions: {
      large: string | null;
      medium: string | null;
      small: string | null;
      micro: string | null;
    };
  }

  export interface Profile {
    id: string;
    username: string;
    displayName: string;
    name: { familyName: string; givenName: string };
    emails: Array<{ value: string }>;
    photos: Array<{ value?: string }>;
    provider: string;
    _json: {
      image: FtImage;
      email: string;
      login: string;
      first_name: string;
      last_name: string;
    };
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    passReqToCallback?: false;
  }

  export interface StrategyOptionsWithRequest {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    passReqToCallback: true;
  }

  export type VerifyCallback = (
    error: Error | null,
    user?: unknown,
    info?: unknown,
  ) => void;

  export type VerifyFunction = (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) => void;

  export type VerifyFunctionWithRequest = (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) => void;

  export class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyFunction);
    constructor(
      options: StrategyOptionsWithRequest,
      verify: VerifyFunctionWithRequest,
    );
  }
}
