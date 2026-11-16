import type { CalendarMethod, UserId } from '@relay/shared/domain';
import type { CalendarExpander, CalendarParser } from '../../ports/calendar-adapters';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import type { CalendarPartsArrival } from '../sync/calendar-parts-sink';
import { InviteCancelHandler } from './invite-cancel-handler';
import type { InviteContext, InviteHandler } from './invite-context';
import { InviteReplyHandler } from './invite-reply-handler';
import { InviteRequestHandler } from './invite-request-handler';
import { retryStale } from './invite-write';
import { ParkedReplies } from './parked-replies';
import { SeriesRangeKeeper } from './series-range-keeper';

export interface InviteIngestorDeps {
  readonly parser: CalendarParser;
  readonly expander: CalendarExpander;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class InviteIngestor {
  private readonly handlers: Record<CalendarMethod, InviteHandler>;

  constructor(private readonly deps: InviteIngestorDeps) {
    const parked = new ParkedReplies();
    const ranges = new SeriesRangeKeeper(deps.expander);
    const request = new InviteRequestHandler(deps.ids, parked, ranges);
    this.handlers = {
      REQUEST: request,
      PUBLISH: request,
      CANCEL: new InviteCancelHandler(deps.ids, ranges),
      REPLY: new InviteReplyHandler(parked),
    };
  }

  async apply(
    repositories: Repositories,
    userId: UserId,
    arrival: CalendarPartsArrival,
  ): Promise<boolean> {
    let changed = false;
    for (const part of arrival.parts) {
      const calendar = this.deps.parser.parse(part);
      if (calendar === null) {
        continue;
      }
      const context: InviteContext = {
        userId,
        account: arrival.account,
        messageId: arrival.messageId,
        threadId: arrival.threadId,
        method: calendar.method,
        now: this.deps.clock.now().toISOString(),
      };
      const handler = this.handlers[calendar.method ?? 'PUBLISH'];
      for (const event of calendar.events) {
        changed = (await retryStale(() => handler.apply(repositories, context, event))) || changed;
      }
    }
    return changed;
  }
}
