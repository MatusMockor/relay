import type { AccountId, MailboxId } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';

export type LabelRescan = PendingWork<'label-rescan'>;

export interface LabelRescansDeps {
  readonly pendingWork: PendingWorkRepository;
  readonly syncStates: SyncStateRepository;
  readonly clock: Clock;
}

export const queueLabelRescans = async (
  repositories: Pick<LabelRescansDeps, 'pendingWork' | 'syncStates'>,
  accountId: AccountId,
  createdAt: string,
): Promise<void> => {
  for (const state of await repositories.syncStates.listByAccount(accountId)) {
    await repositories.pendingWork.put({
      accountId,
      kind: 'label-rescan',
      ref: state.mailboxId,
      payload: { mailboxId: state.mailboxId },
      createdAt,
    });
  }
};

export class LabelRescans {
  constructor(private readonly deps: LabelRescansDeps) {}

  mark(accountId: AccountId): Promise<void> {
    return queueLabelRescans(this.deps, accountId, this.deps.clock.now().toISOString());
  }

  async pending(accountId: AccountId): Promise<Map<MailboxId, LabelRescan>> {
    const works = await this.deps.pendingWork.list(accountId, 'label-rescan');
    return new Map(works.map((work) => [work.payload.mailboxId, work]));
  }

  async done(work: LabelRescan): Promise<void> {
    await this.deps.pendingWork.remove([work]);
  }

  async forget(accountId: AccountId, mailboxId: MailboxId): Promise<void> {
    const key = { accountId, kind: 'label-rescan', ref: mailboxId } as const;
    const work = await this.deps.pendingWork.find(key);
    if (work !== null) {
      await this.deps.pendingWork.remove([work]);
    }
  }
}
