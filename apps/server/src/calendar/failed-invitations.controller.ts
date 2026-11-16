import { Controller } from '@nestjs/common';
import { FailedInvitationService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { FailedInvitation, FailedInvitationRetry } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class FailedInvitationsController {
  constructor(private readonly failed: FailedInvitationService) {}

  @ApiRoute(api.calendar.listFailedInvitations)
  list(@CurrentPrincipal() principal: Principal): Promise<FailedInvitation[]> {
    return this.failed.list(principal.userId);
  }

  @ApiRoute(api.calendar.retryFailedInvitation)
  retry(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.retryFailedInvitation)
    request: RequestOf<typeof api.calendar.retryFailedInvitation>,
  ): Promise<FailedInvitationRetry> {
    return this.failed.retry(principal.userId, request.params);
  }

  @ApiRoute(api.calendar.dismissFailedInvitation)
  async dismiss(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.dismissFailedInvitation)
    request: RequestOf<typeof api.calendar.dismissFailedInvitation>,
  ): Promise<OkResponse> {
    await this.failed.dismiss(principal.userId, request.params);
    return { ok: true };
  }
}
