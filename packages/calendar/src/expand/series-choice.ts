import type { StoredCalendarEvent } from '@relay/engine';
import { compareRevision } from './revision';
import { type RangeOverride, recurrenceAt, type SeriesPlan } from './series-plan';

const outranks = (a: RangeOverride, b: RangeOverride): number =>
  compareRevision(a.event, b.event) || a.from - b.from;

export const rangeAt = (plan: SeriesPlan, at: number): RangeOverride | undefined =>
  plan.ranges
    .filter((range) => range.from <= at)
    .reduce<
      RangeOverride | undefined
    >((best, range) => (best === undefined || outranks(range, best) > 0 ? range : best), undefined);

export const exactWins = (exact: StoredCalendarEvent, range: RangeOverride | undefined): boolean =>
  range === undefined ||
  exact === range.event ||
  exact.status === 'cancelled' ||
  compareRevision(exact, range.event) >= 0;

export const hiddenByCut = (override: StoredCalendarEvent, plan: SeriesPlan): boolean =>
  plan.cut !== null &&
  recurrenceAt(override, plan.timeZone) >= plan.cutAt &&
  compareRevision(override, plan.cut) < 0;

export const visibleLeftover = (override: StoredCalendarEvent, plan: SeriesPlan): boolean =>
  !hiddenByCut(override, plan) &&
  exactWins(override, rangeAt(plan, recurrenceAt(override, plan.timeZone)));
