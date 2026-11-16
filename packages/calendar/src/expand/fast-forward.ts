import ICAL from 'ical.js';
import { type IcalTime, instantOf } from '../ics/ical-time';
import type { ParsedEvent } from './parsed-event';

const DAY_SECONDS = 86_400;
const SLACK_MS = 2 * DAY_SECONDS * 1000;

const PERIOD_SECONDS: Readonly<Record<string, number>> = {
  SECONDLY: 1,
  MINUTELY: 60,
  HOURLY: 3600,
  DAILY: DAY_SECONDS,
  WEEKLY: 7 * DAY_SECONDS,
};

const isRecur = (value: unknown): value is InstanceType<typeof ICAL.Recur> =>
  value instanceof ICAL.Recur;

export const iterationStart = (parsed: ParsedEvent, windowFrom: number): IcalTime | undefined => {
  const rules = parsed.event.component
    .getAllProperties('rrule')
    .map((property): unknown => property.getFirstValue())
    .filter(isRecur);
  const [rule] = rules;
  if (rules.length !== 1 || rule === undefined || typeof rule.count === 'number') {
    return undefined;
  }
  const seconds = (PERIOD_SECONDS[rule.freq] ?? 0) * Math.max(1, rule.interval);
  const startMs = instantOf(parsed.start.time, parsed.start.tzid, 'UTC');
  const steps =
    seconds === 0 ? 0 : Math.floor((windowFrom - SLACK_MS - startMs) / (seconds * 1000)) - 1;
  if (steps <= 0) {
    return undefined;
  }
  const shifted = parsed.start.time.clone();
  if (seconds % DAY_SECONDS === 0) {
    shifted.adjust((steps * seconds) / DAY_SECONDS, 0, 0, 0);
    return shifted;
  }
  shifted.adjust(0, 0, 0, steps * seconds);
  return shifted;
};
