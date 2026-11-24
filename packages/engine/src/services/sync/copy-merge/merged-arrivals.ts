import type { MessageId } from '@relay/shared/domain';
import type { MergeReport } from '../../../model/message-merge';
import type { PendingWork } from '../../../model/pending-work';
import type { MessageRepository } from '../../../ports/message-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { InboxArrival } from '../sync-arrivals';
import type { SyncContext } from '../sync-context';

export interface MergedArrivalsDeps {
  readonly messages: MessageRepository;
  readonly pendingWork: PendingWorkRepository;
}

type KeeperOf = ReadonlyMap<string, MessageId>;

const keepersOf = (report: MergeReport): KeeperOf =>
  new Map(
    report.merged.flatMap((group) =>
      [group.keeperId, ...group.loserIds].map((id): [string, MessageId] => [id, group.keeperId]),
    ),
  );

const replaceAll = <Item>(target: Item[], items: readonly Item[]): void => {
  target.splice(0, target.length, ...items);
};

export class MergedArrivals {
  constructor(private readonly deps: MergedArrivalsDeps) {}

  async canonicalize(context: SyncContext, report: MergeReport): Promise<void> {
    const keeperOf = keepersOf(report);
    const touched =
      context.arrivals.some((arrival) => keeperOf.has(arrival.message.id)) ||
      context.arrivalWork.some((work) => keeperOf.has(work.ref));
    if (!touched) {
      return;
    }
    replaceAll(context.arrivals, await this.arrivals(context, keeperOf));
    replaceAll(context.arrivalWork, await this.work(context, keeperOf));
  }

  private async arrivals(context: SyncContext, keeperOf: KeeperOf): Promise<InboxArrival[]> {
    const byId = new Map<MessageId, InboxArrival>();
    for (const arrival of context.arrivals) {
      const keeperId = keeperOf.get(arrival.message.id);
      const known = byId.get(keeperId ?? arrival.message.id);
      if (known !== undefined) {
        byId.set(known.message.id, { ...known, live: known.live || arrival.live });
        continue;
      }
      if (keeperId === undefined) {
        byId.set(arrival.message.id, arrival);
        continue;
      }
      const keeper = await this.deps.messages.findById(context.userId, keeperId);
      if (keeper !== null) {
        byId.set(keeper.id, { ...arrival, message: keeper });
      }
    }
    return [...byId.values()];
  }

  private async work(
    context: SyncContext,
    keeperOf: KeeperOf,
  ): Promise<PendingWork<'message-effects'>[]> {
    const byRef = new Map<string, PendingWork<'message-effects'>>();
    for (const work of context.arrivalWork) {
      const keeperId = keeperOf.get(work.ref);
      if (keeperId === undefined) {
        byRef.set(work.ref, work);
        continue;
      }
      if (byRef.has(keeperId)) {
        continue;
      }
      const key = { accountId: work.accountId, kind: 'message-effects', ref: keeperId } as const;
      const current = await this.deps.pendingWork.find(key);
      if (current !== null) {
        byRef.set(keeperId, current);
      }
    }
    return [...byRef.values()];
  }
}
