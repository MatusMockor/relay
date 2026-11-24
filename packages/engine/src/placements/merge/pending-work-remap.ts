import type { MessageId } from '@relay/shared/domain';
import type { MergeMapping, PendingWorkRemap } from '../../model/message-merge';
import type { PendingWork, PendingWorkKey } from '../../model/pending-work';
import {
  type ClashingWork,
  PENDING_WORK_REDUCERS,
  type RekeyedWork,
} from './pending-work-reducers';
import { MESSAGE_PENDING_KINDS, type MessagePendingKind, REKEYINGS } from './pending-work-rekeys';

interface KindRemap<Kind extends MessagePendingKind> {
  readonly remove: readonly PendingWorkKey[];
  readonly write: readonly PendingWork<Kind>[];
}

const keyOf = (work: PendingWork): PendingWorkKey => ({
  accountId: work.accountId,
  kind: work.kind,
  ref: work.ref,
});

const sameRow = (left: PendingWork, right: PendingWork): boolean =>
  left.ref === right.ref &&
  left.revision === right.revision &&
  left.createdAt === right.createdAt &&
  JSON.stringify(left.payload) === JSON.stringify(right.payload);

const ofKind = <Kind extends MessagePendingKind>(
  kind: Kind,
  rows: readonly PendingWork[],
): PendingWork<Kind>[] => rows.filter((row): row is PendingWork<Kind> => row.kind === kind);

const clashesOf = <Kind extends MessagePendingKind>(
  rekeyed: readonly RekeyedWork<Kind>[],
): ClashingWork<Kind>[] => {
  const byRef = new Map<string, ClashingWork<Kind>>();
  rekeyed.forEach((work) => {
    const clashing = byRef.get(work.next.ref);
    byRef.set(work.next.ref, clashing === undefined ? [work] : [...clashing, work]);
  });
  return [...byRef.values()];
};

const settle = <Kind extends MessagePendingKind>(
  kind: Kind,
  clashing: ClashingWork<Kind>,
): KindRemap<Kind> => {
  const reduce = PENDING_WORK_REDUCERS[kind];
  const winner = reduce(clashing);
  const untouched = clashing.find((work) => sameRow(work.original, winner));
  return {
    remove: clashing.filter((work) => work !== untouched).map((work) => keyOf(work.original)),
    write: untouched === undefined ? [winner] : [],
  };
};

const remapKind = <Kind extends MessagePendingKind>(
  kind: Kind,
  rows: readonly PendingWork[],
  keepers: ReadonlyMap<string, MessageId>,
  mapping: MergeMapping,
): KindRemap<Kind> => {
  const rekeying = REKEYINGS[kind];
  const rekeyed = ofKind(kind, rows).flatMap((original): RekeyedWork<Kind>[] => {
    const owner = rekeying.ownerOf(original);
    const keeper = keepers.get(owner);
    if (keeper === undefined) {
      return [];
    }
    return [
      { original, next: rekeying.rekey(original, keeper, mapping), fromKeeper: owner === keeper },
    ];
  });
  const settled = clashesOf(rekeyed).map((clashing) => settle(kind, clashing));
  return {
    remove: settled.flatMap((remap) => remap.remove),
    write: settled.flatMap((remap) => remap.write),
  };
};

export const remapPendingWork = (
  memberRows: readonly PendingWork[],
  mapping: MergeMapping,
): PendingWorkRemap => {
  const keepers = new Map<string, MessageId>(mapping.keeperOf);
  const remaps = MESSAGE_PENDING_KINDS.map((kind) => remapKind(kind, memberRows, keepers, mapping));
  return {
    remove: remaps.flatMap((remap) => remap.remove),
    write: remaps.flatMap((remap) => remap.write),
  };
};
