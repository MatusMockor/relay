import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DeviceId, UserId } from '@relay/shared/domain';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';
import type { NewRefreshToken } from '../../core';
import { RefreshTokenCodec } from './refresh-token.codec';

export interface MintedRefreshToken {
  readonly token: string;
  readonly record: NewRefreshToken;
}

export interface RefreshTokenOwner {
  readonly userId: UserId;
  readonly deviceId: DeviceId;
  readonly familyId: string;
}

@Injectable()
export class RefreshTokenFactory {
  private readonly ttlMs: number;

  constructor(
    private readonly codec: RefreshTokenCodec,
    @Inject(SERVER_CONFIG) config: ServerConfig,
  ) {
    this.ttlMs = config.auth.refreshTokenTtlSeconds * 1000;
  }

  newFamilyId(): string {
    return `fam_${randomBytes(16).toString('base64url')}`;
  }

  mint(owner: RefreshTokenOwner, now: Date): MintedRefreshToken {
    const token = this.codec.generate();
    return {
      token,
      record: {
        id: `rt_${randomBytes(16).toString('base64url')}`,
        userId: owner.userId,
        deviceId: owner.deviceId,
        familyId: owner.familyId,
        tokenHash: this.codec.hash(token),
        expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
        createdAt: now.toISOString(),
      },
    };
  }
}
