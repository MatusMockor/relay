import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type Clock, PORT_TOKENS } from '@relay/engine';
import { DeviceIdSchema, UserIdSchema } from '@relay/shared/domain';
import { z } from 'zod';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';
import type { Principal } from '../principal';

const AccessTokenPayloadSchema = z.object({
  sub: UserIdSchema,
  did: DeviceIdSchema,
  typ: z.literal('access'),
});

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: string;
}

@Injectable()
export class AccessTokenService {
  private readonly jwt: JwtService;
  private readonly ttlSeconds: number;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
  ) {
    this.jwt = new JwtService({
      secret: config.auth.accessTokenSecret,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    });
    this.ttlSeconds = config.auth.accessTokenTtlSeconds;
  }

  async issue(principal: Principal): Promise<IssuedAccessToken> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAt = issuedAt + this.ttlSeconds;
    const token = await this.jwt.signAsync({
      sub: principal.userId,
      did: principal.deviceId,
      typ: 'access',
      iat: issuedAt,
      exp: expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  async verify(token: string): Promise<Principal | null> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      const parsed = AccessTokenPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return null;
      }
      return { userId: parsed.data.sub, deviceId: parsed.data.did };
    } catch {
      return null;
    }
  }
}
