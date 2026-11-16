import type { StoredCalendarEvent } from '@relay/engine';
import { compareRevision } from './revision';
import {
  lifts,
  type RangeOverride,
  recurrenceAt,
  type SeriesCut,
  type SeriesPlan,
} from './series-plan';

const outranks = (a: RangeOverride, b: RangeOverride): number =>
  compareRevision(a.event, b.event) || a.from - b.from;

const endedBefore = (plan: SeriesPlan, range: RangeOverride, at: number): boolean =>
  plan.cuts.some(
    (cut) =>
      cut.from >= range.from && cut.from <= at && compareRevision(cut.event, range.event) >= 0,
  );

const cutsAt = (plan: SeriesPlan, at: number): SeriesCut[] =>
  plan.cuts.filter(
    (cut) => cut.from <= at && !plan.ranges.some((range) => range.from <= at && lifts(range, cut)),
  );

export const cutAt = (plan: SeriesPlan, at: number): SeriesCut | undefined => cutsAt(plan, at)[0];

export const rangeAt = (plan: SeriesPlan, at: number): RangeOverride | undefined =>
  plan.ranges
    .filter((range) => range.from <= at && !endedBefore(plan, range, at))
    .reduce<
      RangeOverride | undefined
    >((best, range) => (best === undefined || outranks(range, best) > 0 ? range : best), undefined);

export const exactWins = (exact: StoredCalendarEvent, range: RangeOverride | undefined): boolean =>
  range === undefined || exact === range.event || compareRevision(exact, range.event) >= 0;

export const hiddenByCut = (override: StoredCalendarEvent, plan: SeriesPlan): boolean =>
  cutsAt(plan, recurrenceAt(override, plan.timeZone)).some(
    (cut) => compareRevision(override, cut.event) < 0,
  );

export const shownAt = (exact: StoredCalendarEvent, plan: SeriesPlan, at: number): boolean => {
  if (cutAt(plan, at) !== undefined) {
    return !hiddenByCut(exact, plan);
  }
  return exactWins(exact, rangeAt(plan, at));
};

export const visibleLeftover = (override: StoredCalendarEvent, plan: SeriesPlan): boolean =>
  shownAt(override, plan, recurrenceAt(override, plan.timeZone));
