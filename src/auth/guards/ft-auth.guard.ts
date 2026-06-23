import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class FtAuthGuard extends AuthGuard('42') {
  private readonly logger = new Logger(FtAuthGuard.name);

  handleRequest<T>(err: Error, user: T, info: unknown): T {
    if (err || !user) {
      this.logger.error('42 OAuth failed', err?.message ?? String(info));
      throw err ?? new UnauthorizedException('42 OAuth authentication failed');
    }
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context);
    return result as boolean;
  }
}
