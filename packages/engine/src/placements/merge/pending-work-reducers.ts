import type { PendingWork } from '../../model/pending-work';
import type { MessagePendingKind } from './pending-work-rekeys';

export interface RekeyedWork<Kind extends MessagePendingKind> {
  readonly original: PendingWork<Kind>;
  readonly next: PendingWork<Kind>;
  readonly fromKeeper: boolean;
}

export type ClashingWork<Kind extends MessagePendingKind> = readonly [
  RekeyedWork<Kind>,
  ...RekeyedWork<Kind>[],
];

export type PendingWorkReducer<Kind extends MessagePendingKind> = (
  clashing: ClashingWork<Kind>,
) => PendingWork<Kind>;

type WorkOrder = <Kind extends MessagePendingKind>(
  left: RekeyedWork<Kind>,
  right: RekeyedWork<Kind>,
) => number;

const firstBy = <Kind extends MessagePendingKind>(
  clashing: ClashingWork<Kind>,
  order: WorkOrder,
): PendingWork<Kind> => {
  const [first, ...rest] = clashing;
  return rest.reduce((best, work) => (order(work, best) < 0 ? work : best), first).next;
};

const keeperRank = <Kind extends MessagePendingKind>(work: RekeyedWork<Kind>): number =>
  work.fromKeeper ? 1 : 0;

const timeOf = <Kind extends MessagePendingKind>(work: RekeyedWork<Kind>): number =>
  Date.parse(work.next.createdAt);

const byOriginalRef: WorkOrder = (left, right) => {
  if (left.original.ref === right.original.ref) {
    return 0;
  }
  return left.original.ref < right.original.ref ? -1 : 1;
};

export const latestIntent = <Kind extends MessagePendingKind>(
  clashing: ClashingWork<Kind>,
): PendingWork<Kind> =>
  firstBy(
    clashing,
    (left, right) =>
      timeOf(right) - timeOf(left) ||
      keeperRank(right) - keeperRank(left) ||
      byOriginalRef(left, right),
  );

export const keeperRow = <Kind extends MessagePendingKind>(
  clashing: ClashingWork<Kind>,
): PendingWork<Kind> =>
  firstBy(
    clashing,
    (left, right) =>
      keeperRank(right) - keeperRank(left) ||
      timeOf(left) - timeOf(right) ||
      byOriginalRef(left, right),
  );

export const mergedEffects: PendingWorkReducer<'message-effects'> = (clashing) => {
  const base = keeperRow(clashing);
  const payloads = clashing.map((work) => work.next.payload);
  const live = payloads.some((payload) => payload.live === true);
  return {
    ...base,
    payload: {
      ...base.payload,
      publish: payloads.some((payload) => payload.publish),
      arrival: payloads.some((payload) => payload.arrival),
      ...(live ? { live } : {}),
    },
  };
};

export const PENDING_WORK_REDUCERS: {
  readonly [Kind in MessagePendingKind]: PendingWorkReducer<Kind>;
} = {
  'provider-op': latestIntent,
  'message-effects': mergedEffects,
  'jira-event': keeperRow,
  'calendar-invite': keeperRow,
  'calendar-rebuild-part': keeperRow,
  'calendar-reply': keeperRow,
  'trash-origin': latestIntent,
  'spam-origin': latestIntent,
  'move-origin': latestIntent,
};
