import { Controller } from '@nestjs/common';
import { GoogleCalendarService } from '@relay/engine';
import { api, type CreatedCalendarEvent, type OkResponse } from '@relay/shared/api';
import type {
  GoogleCalendar,
  GoogleCalendarConnection,
  GoogleCalendarOverview,
} from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { GoogleCalendarConnector } from './google-calendar-connector';

const routes = api.googleCalendar;

@Controller()
export class GoogleCalendarController {
  constructor(
    private readonly google: GoogleCalendarService,
    private readonly connector: GoogleCalendarConnector,
  ) {}

  @ApiRoute(routes.overview)
  overview(@CurrentPrincipal() principal: Principal): Promise<GoogleCalendarOverview> {
    return this.google.overview(principal.userId);
  }

  @ApiRoute(routes.connect)
  connect(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.connect) request: RequestOf<typeof routes.connect>,
  ): Promise<GoogleCalendarConnection> {
    return this.connector.connect(principal.userId, request.body.oauth);
  }

  @ApiRoute(routes.disconnect)
  async disconnect(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.disconnect) request: RequestOf<typeof routes.disconnect>,
  ): Promise<OkResponse> {
    await this.google.disconnect(principal.userId, request.params.id);
    return { ok: true };
  }

  @ApiRoute(routes.sync)
  sync(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.sync) request: RequestOf<typeof routes.sync>,
  ): Promise<GoogleCalendarConnection> {
    return this.google.sync(principal.userId, request.params.id);
  }

  @ApiRoute(routes.updateCalendar)
  updateCalendar(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.updateCalendar) request: RequestOf<typeof routes.updateCalendar>,
  ): Promise<GoogleCalendar> {
    return this.google.updateCalendar(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(routes.createEvent)
  createEvent(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.createEvent) request: RequestOf<typeof routes.createEvent>,
  ): Promise<CreatedCalendarEvent> {
    return this.google.createEvent(principal.userId, request.body);
  }

  @ApiRoute(routes.deleteEvent)
  async deleteEvent(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.deleteEvent) request: RequestOf<typeof routes.deleteEvent>,
  ): Promise<OkResponse> {
    await this.google.deleteEvent(principal.userId, request.params.id);
    return { ok: true };
  }

  @ApiRoute(routes.respond)
  async respond(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.respond) request: RequestOf<typeof routes.respond>,
  ): Promise<OkResponse> {
    await this.google.respond(principal.userId, request.params.id, request.body.response);
    return { ok: true };
  }
}
