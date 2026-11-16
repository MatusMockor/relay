import { toIso } from '../ics/ical-time';
import { seriesEndOf } from '../ics/series-range';
import { spanOf } from './occurrence-span';
import type { ParsedEvent } from './parsed-event';
import type { SeriesPlan } from './series-plan';

const SLACK_MS = 86_400_000;

export const seriesRangeEndOf = (parsed: ParsedEvent, plan: SeriesPlan): string | null => {
  const base = spanOf(parsed.start, parsed.end, plan.timeZone);
  const longest = Math.max(
    base.end - base.start,
    ...parsed.periods.values(),
    ...plan.ranges.map((range) => Math.max(range.shift, range.offset) + range.length),
  );
  const natural = seriesEndOf(parsed.event, parsed.start.tzid, longest);
  const bound = plan.stopAt + longest + SLACK_MS;
  if (natural === null) {
    return Number.isFinite(bound) ? toIso(bound) : null;
  }
  return toIso(Math.min(natural, bound));
};
