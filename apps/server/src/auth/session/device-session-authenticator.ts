import { Inject, Injectable } from '@nestjs/common';
import { type DeviceRepository, SERVER_PORT_TOKENS } from '../../core';
import type { Principal } from '../principal';
import { AccessTokenService } from '../tokens/access-token.service';
import type { AccessTokenAuthenticator } from './access-token-authenticator';

@Injectable()
export class DeviceSessionAuthenticator implements AccessTokenAuthenticator {
  constructor(
    private readonly accessTokens: AccessTokenService,
    @Inject(SERVER_PORT_TOKENS.DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async authenticate(accessToken: string): Promise<Principal | null> {
    const principal = await this.accessTokens.verify(accessToken);
    if (principal === null) {
      return null;
    }
    const device = await this.devices.findActive(principal.userId, principal.deviceId);
    return device === null ? null : principal;
  }
}
