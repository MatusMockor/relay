import ICAL from 'ical.js';
import { type IcalTime, instantOf } from './ical-time';

type Event = InstanceType<typeof ICAL.Event>;
type Recur = InstanceType<typeof ICAL.Recur>;
type Expansion = InstanceType<typeof ICAL.RecurExpansion>;

export const step = (iterator: Expansion): IcalTime | undefined => iterator.next();

export const MAX_ITERATIONS = 20_000;
const SLACK_MS = 86_400_000;

const isRecur = (value: unknown): value is Recur => value instanceof ICAL.Recur;

const isUnbounded = (event: Event): boolean =>
  event.component
    .getAllProperties('rrule')
    .map((property): unknown => property.getFirstValue())
    .some((rule) => isRecur(rule) && !rule.isFinite());

export const seriesEndOf = (
  event: Event,
  tzid: string | null,
  durationMs: number,
): number | null => {
  if (isUnbounded(event)) {
    return null;
  }
  try {
    const iterator = event.iterator();
    let last: IcalTime | null = null;
    for (let index = 0; index < MAX_ITERATIONS; index += 1) {
      const next = step(iterator);
      if (next === undefined) {
        return last === null ? null : instantOf(last, tzid, 'UTC') + durationMs + SLACK_MS;
      }
      last = next;
    }
    return null;
  } catch {
    return null;
  }
};
