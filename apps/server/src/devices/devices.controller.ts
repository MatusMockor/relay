import { Controller } from '@nestjs/common';
import { api, type DeviceView, type OkResponse } from '@relay/shared/api';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { DeviceSessionService } from '../auth/session/device-session.service';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class DevicesController {
  constructor(private readonly sessions: DeviceSessionService) {}

  @ApiRoute(api.devices.list)
  list(@CurrentPrincipal() principal: Principal): Promise<DeviceView[]> {
    return this.sessions.list(principal);
  }

  @ApiRoute(api.devices.revoke)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.devices.revoke) request: RequestOf<typeof api.devices.revoke>,
  ): Promise<OkResponse> {
    await this.sessions.revoke(principal, request.params.id);
    return { ok: true };
  }
}
