import type { Label, UserId } from '@relay/shared/domain';
import type { ProviderChange } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { Repositories } from '../../ports/repositories';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { refreshThread, type ThreadRefreshOutcome } from '../shared/thread-refresh';

export interface LabelRemovalDeps {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
}

const writesLabel = (label: Label, change: ProviderChange): boolean => {
  if (change.kind === 'keyword') {
    return label.kind === 'keyword' && change.keyword === label.remoteName;
  }
  if (change.kind === 'label') {
    return label.kind === 'gmail' && change.label === label.remoteName;
  }
  return false;
};

const dropPendingWrites = async (repositories: Repositories, label: Label): Promise<void> => {
  const ops = await repositories.pendingWork.list(label.accountId, 'provider-op');
  await repositories.pendingWork.remove(ops.filter((op) => writesLabel(label, op.payload.change)));
};

const queuePurge = async (repositories: Repositories, label: Label, now: string) => {
  const states = await repositories.syncStates.listByAccount(label.accountId);
  if (states.length === 0) {
    return;
  }
  await repositories.pendingWork.put({
    accountId: label.accountId,
    kind: 'keyword-purge',
    ref: label.remoteName,
    payload: { keyword: label.remoteName, mailboxIds: states.map((state) => state.mailboxId) },
    createdAt: now,
  });
};

const dropMailbox = async (repositories: Repositories, label: Label): Promise<void> => {
  const all = await repositories.mailboxes.listForSync(label.accountId);
  if (!all.some((mailbox) => mailbox.path === label.remoteName)) {
    return;
  }
  const kept = all.filter((mailbox) => mailbox.path !== label.remoteName);
  await repositories.mailboxes.deleteMissing(
    label.accountId,
    kept.map((mailbox) => mailbox.path),
  );
};

export class LabelRemoval {
  constructor(private readonly deps: LabelRemovalDeps) {}

  run(userId: UserId, label: Label): Promise<ThreadRefreshOutcome[]> {
    const now = this.deps.clock.now().toISOString();
    return this.deps.unitOfWork.run(async (repositories) => {
      const threadIds = await repositories.messages.listThreadIdsByLabel(label.id);
      await dropPendingWrites(repositories, label);
      await repositories.labels.delete(userId, label.id);
      await (label.kind === 'keyword'
        ? queuePurge(repositories, label, now)
        : dropMailbox(repositories, label));
      const outcomes: ThreadRefreshOutcome[] = [];
      for (const threadId of threadIds) {
        outcomes.push(await refreshThread(repositories, userId, label.accountId, threadId));
      }
      return outcomes;
    });
  }
}
