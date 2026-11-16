import { Controller } from '@nestjs/common';
import { CalendarService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { CalendarSubscription } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class CalendarSubscriptionsController {
  constructor(private readonly calendar: CalendarService) {}

  @ApiRoute(api.calendar.listSubscriptions)
  list(@CurrentPrincipal() principal: Principal): Promise<CalendarSubscription[]> {
    return this.calendar.listSubscriptions(principal.userId);
  }

  @ApiRoute(api.calendar.createSubscription)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.createSubscription)
    request: RequestOf<typeof api.calendar.createSubscription>,
  ): Promise<CalendarSubscription> {
    return this.calendar.createSubscription(principal.userId, request.body);
  }

  @ApiRoute(api.calendar.updateSubscription)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.updateSubscription)
    request: RequestOf<typeof api.calendar.updateSubscription>,
  ): Promise<CalendarSubscription> {
    return this.calendar.updateSubscription(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.calendar.deleteSubscription)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.deleteSubscription)
    request: RequestOf<typeof api.calendar.deleteSubscription>,
  ): Promise<OkResponse> {
    await this.calendar.deleteSubscription(principal.userId, request.params.id);
    return { ok: true };
  }

  @ApiRoute(api.calendar.refreshSubscription)
  refresh(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.refreshSubscription)
    request: RequestOf<typeof api.calendar.refreshSubscription>,
  ): Promise<CalendarSubscription> {
    return this.calendar.refreshSubscription(principal.userId, request.params.id);
  }
}
