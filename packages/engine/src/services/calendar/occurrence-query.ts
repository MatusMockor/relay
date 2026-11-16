import type { CalendarOccurrence, UserId } from '@relay/shared/domain';
import type { CalendarWindow, ExpandedOccurrence } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import type { VisibleEvent } from '../google-calendar/google-calendar-visibility';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import type { CalendarColors } from './calendar-colors';
import { preferGoogleCopies } from './google-copies';
import { type AccessLookup, byStart, toOccurrence } from './occurrence-mapper';
import { groupSeries } from './series-grouping';

const SLACK_MS = 86_400_000;

const widen = (window: CalendarWindow): { from: string; to: string } => ({
  from: new Date(Date.parse(window.from) - SLACK_MS).toISOString(),
  to: new Date(Date.parse(window.to) + SLACK_MS).toISOString(),
});

export interface OccurrenceQueryDeps {
  readonly events: CalendarEventRepository;
  readonly expander: CalendarExpander;
  readonly colors: CalendarColors;
  readonly access?: { lookup(userId: UserId): Promise<AccessLookup> };
  readonly visibility?: { lookup(userId: UserId): Promise<VisibleEvent> };
}

export class OccurrenceQuery {
  constructor(private readonly deps: OccurrenceQueryDeps) {}

  async expand(userId: UserId, window: CalendarWindow): Promise<ExpandedOccurrence[]> {
    const [rows, visible] = await Promise.all([
      this.deps.events.listForRange(userId, widen(window)),
      this.deps.visibility?.lookup(userId),
    ]);
    const shown = visible === undefined ? rows : rows.filter(visible);
    return groupSeries(preferGoogleCopies(shown))
      .flatMap((series) => this.deps.expander.expand(series, window))
      .filter((occurrence) => occurrence.event.status !== 'cancelled');
  }

  async list(userId: UserId, window: CalendarWindow): Promise<CalendarOccurrence[]> {
    const [expanded, colorOf, accessOf] = await Promise.all([
      this.expand(userId, window),
      this.deps.colors.lookup(userId),
      this.deps.access?.lookup(userId),
    ]);
    return expanded.map((occurrence) => toOccurrence(occurrence, colorOf, accessOf)).sort(byStart);
  }
}
