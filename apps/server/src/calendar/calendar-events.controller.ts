import { Controller } from '@nestjs/common';
import { CalendarService } from '@relay/engine';
import { api, type CalendarOccurrenceList } from '@relay/shared/api';
import type { CalendarInvitation } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class CalendarEventsController {
  constructor(private readonly calendar: CalendarService) {}

  @ApiRoute(api.calendar.occurrences)
  async occurrences(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.occurrences) request: RequestOf<typeof api.calendar.occurrences>,
  ): Promise<CalendarOccurrenceList> {
    return { items: await this.calendar.occurrences(principal.userId, request.query) };
  }

  @ApiRoute(api.calendar.invitations)
  invitations(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.invitations) request: RequestOf<typeof api.calendar.invitations>,
  ): Promise<CalendarInvitation[]> {
    return this.calendar.invitations(
      principal.userId,
      request.query.threadId,
      request.query.timeZone,
    );
  }

  @ApiRoute(api.calendar.rsvp)
  rsvp(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.calendar.rsvp) request: RequestOf<typeof api.calendar.rsvp>,
  ): Promise<CalendarInvitation> {
    return this.calendar.respond(
      principal.userId,
      request.params.id,
      request.body.response,
      request.body.timeZone,
    );
  }
}
