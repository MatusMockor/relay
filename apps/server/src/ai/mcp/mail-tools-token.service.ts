import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type Clock, PORT_TOKENS } from '@relay/engine';
import { AiLeaseIdSchema } from '@relay/shared/api';
import {
  type AiJobId,
  AiJobIdSchema,
  type DeviceId,
  DeviceIdSchema,
  type UserId,
  UserIdSchema,
} from '@relay/shared/domain';
import { z } from 'zod';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';

const AUDIENCE = 'relay-mail-mcp';
export const SERVER_MAIL_TOOLS_TTL_SECONDS = 15 * 60;

const PayloadSchema = z.object({
  sub: UserIdSchema,
  typ: z.literal('mail-tools'),
  job: AiJobIdSchema,
  dev: DeviceIdSchema.optional(),
  lease: AiLeaseIdSchema.optional(),
});

export interface MailToolsHolder {
  readonly deviceId: DeviceId;
  readonly leaseId: string;
}

export interface MailToolsGrant {
  readonly userId: UserId;
  readonly jobId: AiJobId;
  readonly holder: MailToolsHolder | null;
}

export interface IssuedMailToolsToken {
  readonly token: string;
  readonly expiresAt: string;
}

@Injectable()
export class MailToolsTokenService {
  private readonly jwt: JwtService;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
  ) {
    this.jwt = new JwtService({
      secret: config.auth.accessTokenSecret,
      signOptions: { algorithm: 'HS256', audience: AUDIENCE },
      verifyOptions: { algorithms: ['HS256'], audience: AUDIENCE },
    });
  }

  async issue(
    grant: MailToolsGrant,
    ttlSeconds = SERVER_MAIL_TOOLS_TTL_SECONDS,
  ): Promise<IssuedMailToolsToken> {
    const issuedAt = this.nowSeconds();
    const expiresAt = issuedAt + ttlSeconds;
    const token = await this.jwt.signAsync({
      sub: grant.userId,
      typ: 'mail-tools',
      job: grant.jobId,
      ...(grant.holder === null ? {} : { dev: grant.holder.deviceId, lease: grant.holder.leaseId }),
      iat: issuedAt,
      exp: expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  async verify(token: string): Promise<MailToolsGrant | null> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        clockTimestamp: this.nowSeconds(),
      });
      const parsed = PayloadSchema.safeParse(payload);
      return parsed.success ? toGrant(parsed.data) : null;
    } catch {
      return null;
    }
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }
}

const toGrant = (payload: z.infer<typeof PayloadSchema>): MailToolsGrant | null => {
  const { dev, lease } = payload;
  if ((dev === undefined) !== (lease === undefined)) {
    return null;
  }
  return {
    userId: payload.sub,
    jobId: payload.job,
    holder: dev === undefined || lease === undefined ? null : { deviceId: dev, leaseId: lease },
  };
};
