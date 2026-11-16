import { type IcalTime, recurrenceKeyOf } from '../ics/ical-time';
import { MAX_ITERATIONS, step } from '../ics/series-range';
import { iterationStart } from './fast-forward';
import type { ParsedEvent } from './parsed-event';

export interface KeyedTime {
  readonly time: IcalTime;
  readonly key: string;
}

export function* occurrenceTimes(parsed: ParsedEvent, windowFrom: number): Generator<KeyedTime> {
  const seen = new Set<string>();
  if (!parsed.event.component.hasProperty('rrule')) {
    const key = recurrenceKeyOf(parsed.start.time, parsed.start.tzid);
    seen.add(key);
    yield { time: parsed.start.time, key };
  }
  const iterator = parsed.event.iterator(iterationStart(parsed, windowFrom));
  for (let index = 0; index < MAX_ITERATIONS; index += 1) {
    const time = step(iterator);
    if (time === undefined) {
      return;
    }
    const key = recurrenceKeyOf(time, parsed.start.tzid);
    if (!seen.has(key)) {
      seen.add(key);
      yield { time, key };
    }
  }
}
