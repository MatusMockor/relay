import { Inject, Injectable } from '@nestjs/common';
import { type Clock, type IdGenerator, PORT_TOKENS } from '@relay/engine';
import type { AuthSession } from '@relay/shared/api';
import type { DeviceRegistration, User } from '@relay/shared/domain';
import type { ServerRepositories } from '../../core';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenFactory } from '../tokens/refresh-token-factory';

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenFactory,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
    @Inject(PORT_TOKENS.IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async issue(
    repositories: ServerRepositories,
    user: User,
    registration: DeviceRegistration,
  ): Promise<AuthSession> {
    const now = this.clock.now();
    const device = await repositories.devices.create({
      id: this.ids.generate('device'),
      userId: user.id,
      name: registration.name,
      platform: registration.platform,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    });
    const refresh = this.refreshTokens.mint(
      { userId: user.id, deviceId: device.id, familyId: this.refreshTokens.newFamilyId() },
      now,
    );
    await repositories.refreshTokens.store(refresh.record);
    const access = await this.accessTokens.issue({ userId: user.id, deviceId: device.id });
    return {
      user,
      device,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
    };
  }
}
