import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';

@Injectable()
export class RefreshTokenCodec {
  private readonly secret: string;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.secret = config.auth.refreshTokenSecret;
  }

  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('base64url');
  }
}
