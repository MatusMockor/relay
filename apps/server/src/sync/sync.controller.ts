import { Controller } from '@nestjs/common';
import { api, type SyncNowResponse } from '@relay/shared/api';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { SyncNowService } from './sync-now.service';

@Controller()
export class SyncController {
  constructor(private readonly syncNow: SyncNowService) {}

  @ApiRoute(api.sync.now)
  async now(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.sync.now) request: RequestOf<typeof api.sync.now>,
  ): Promise<SyncNowResponse> {
    await this.syncNow.request(principal.userId, request.body);
    return { accepted: true };
  }
}
