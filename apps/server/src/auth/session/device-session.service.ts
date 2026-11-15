import { Inject, Injectable } from '@nestjs/common';
import { type Clock, NotFoundError, PORT_TOKENS } from '@relay/engine';
import type { DeviceView, MeResponse } from '@relay/shared/api';
import type { DeviceId } from '@relay/shared/domain';
import {
  type DeviceRepository,
  SERVER_PORT_TOKENS,
  type ServerUnitOfWork,
  type UserRepository,
} from '../../core';
import { ApiException } from '../../http/api-exception';
import type { Principal } from '../principal';
import { DeviceRevocations } from './device-revocations';

@Injectable()
export class DeviceSessionService {
  constructor(
    @Inject(SERVER_PORT_TOKENS.UserRepository) private readonly users: UserRepository,
    @Inject(SERVER_PORT_TOKENS.DeviceRepository) private readonly devices: DeviceRepository,
    @Inject(SERVER_PORT_TOKENS.ServerUnitOfWork) private readonly unitOfWork: ServerUnitOfWork,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
    private readonly revocations: DeviceRevocations,
  ) {}

  async me(principal: Principal): Promise<MeResponse> {
    const [user, device] = await Promise.all([
      this.users.findById(principal.userId),
      this.devices.findActive(principal.userId, principal.deviceId),
    ]);
    if (user === null || device === null) {
      throw new ApiException('unauthorized', 'Session is no longer valid');
    }
    return { user, device };
  }

  async list(principal: Principal): Promise<DeviceView[]> {
    const devices = await this.devices.listForUser(principal.userId);
    return devices.map((device) => ({ ...device, current: device.id === principal.deviceId }));
  }

  async revoke(principal: Principal, deviceId: DeviceId): Promise<void> {
    const now = this.clock.now().toISOString();
    const revoked = await this.unitOfWork.run(async (repositories) => {
      const done = await repositories.devices.revoke(principal.userId, deviceId, now);
      if (done) {
        await repositories.refreshTokens.revokeDevice(deviceId, now);
      }
      return done;
    });
    if (!revoked) {
      throw new NotFoundError('Device', deviceId);
    }
    this.revocations.notify(deviceId);
  }
}
