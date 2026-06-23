import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';

interface OAuthClientRequest extends Request {
  body: {
    client_id?: unknown;
    client_secret?: unknown;
  };
  oauthClient?: {
    clientId: string;
    name: string;
  };
}

@Injectable()
export class OAuthClientGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OAuthClientRequest>();
    const { client_id, client_secret } = request.body;

    if (typeof client_id !== 'string' || typeof client_secret !== 'string') {
      throw new UnauthorizedException(
        'client_id and client_secret are required',
      );
    }

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: client_id },
    });

    if (!client) throw new UnauthorizedException('Invalid client credentials');

    const valid = await bcrypt.compare(client_secret, client.clientSecret);
    if (!valid) throw new UnauthorizedException('Invalid client credentials');

    request.oauthClient = client;
    return true;
  }
}
