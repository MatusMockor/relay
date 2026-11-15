import { Controller } from '@nestjs/common';
import { ComposeService } from '@relay/engine';
import { api, type OkResponse, type SendResponse } from '@relay/shared/api';
import type { ScheduledSend } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class SendingController {
  constructor(private readonly compose: ComposeService) {}

  @ApiRoute(api.compose.send)
  send(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.compose.send) request: RequestOf<typeof api.compose.send>,
  ): Promise<SendResponse> {
    return this.compose.send(principal.userId, request.body);
  }

  @ApiRoute(api.compose.listScheduled)
  listScheduled(@CurrentPrincipal() principal: Principal): Promise<ScheduledSend[]> {
    return this.compose.listScheduled(principal.userId);
  }

  @ApiRoute(api.compose.cancelScheduled)
  async cancelScheduled(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.compose.cancelScheduled)
    request: RequestOf<typeof api.compose.cancelScheduled>,
  ): Promise<OkResponse> {
    await this.compose.cancelScheduled(principal.userId, request.params.id);
    return { ok: true };
  }
}
