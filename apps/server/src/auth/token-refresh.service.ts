import { Inject, Injectable } from '@nestjs/common';
import { type Clock, PORT_TOKENS } from '@relay/engine';
import type { TokenPair } from '@relay/shared/api';
import {
  type RefreshTokenRecord,
  SERVER_PORT_TOKENS,
  type ServerRepositories,
  type ServerUnitOfWork,
} from '../core';
import { ApiException } from '../http/api-exception';
import { DeviceRevocations } from './session/device-revocations';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenCodec } from './tokens/refresh-token.codec';
import { RefreshTokenFactory } from './tokens/refresh-token-factory';

type RefreshOutcome =
  | { readonly kind: 'rotated'; readonly pair: TokenPair }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'reused'; readonly record: RefreshTokenRecord };

@Injectable()
export class TokenRefreshService {
  constructor(
    @Inject(SERVER_PORT_TOKENS.ServerUnitOfWork) private readonly unitOfWork: ServerUnitOfWork,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
    private readonly codec: RefreshTokenCodec,
    private readonly factory: RefreshTokenFactory,
    private readonly accessTokens: AccessTokenService,
    private readonly revocations: DeviceRevocations,
  ) {}

  async refresh(refreshToken: string): Promise<TokenPair> {
    const outcome = await this.unitOfWork.run((repositories) =>
      this.rotate(repositories, refreshToken),
    );
    if (outcome.kind === 'rotated') {
      return outcome.pair;
    }
    if (outcome.kind === 'reused') {
      await this.revokeFamily(outcome.record);
    }
    throw new ApiException('unauthorized', 'Invalid refresh token');
  }

  private async rotate(
    repositories: ServerRepositories,
    refreshToken: string,
  ): Promise<RefreshOutcome> {
    const now = this.clock.now();
    const record = await repositories.refreshTokens.findByHash(this.codec.hash(refreshToken));
    if (record === null || record.revokedAt !== null) {
      return { kind: 'rejected' };
    }
    if (record.rotatedAt !== null) {
      return { kind: 'reused', record };
    }
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      return { kind: 'rejected' };
    }
    const device = await repositories.devices.findActive(record.userId, record.deviceId);
    if (device === null) {
      return { kind: 'rejected' };
    }
    const next = this.factory.mint(record, now);
    const rotated = await repositories.refreshTokens.rotate(
      record.id,
      next.record,
      now.toISOString(),
    );
    if (rotated === null) {
      return { kind: 'reused', record };
    }
    await repositories.devices.touch(record.deviceId, now.toISOString());
    const access = await this.accessTokens.issue(record);
    return {
      kind: 'rotated',
      pair: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: next.token,
      },
    };
  }

  private async revokeFamily(record: RefreshTokenRecord): Promise<void> {
    const now = this.clock.now().toISOString();
    await this.unitOfWork.run(async (repositories) => {
      await repositories.refreshTokens.revokeFamily(record.familyId, now);
      await repositories.devices.revoke(record.userId, record.deviceId, now);
    });
    this.revocations.notify(record.deviceId);
  }
}
