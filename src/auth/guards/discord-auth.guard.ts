import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DiscordAuthGuard extends AuthGuard('discord') {
  private readonly logger = new Logger(DiscordAuthGuard.name);

  handleRequest<T>(err: Error, user: T, info: unknown): T {
    if (err || !user) {
      this.logger.error('Discord OAuth failed', err?.message ?? String(info));
      throw err ?? new UnauthorizedException('Discord OAuth authentication failed');
    }
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context);
    return result as boolean;
  }
}
