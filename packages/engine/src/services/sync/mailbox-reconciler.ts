import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxSyncState } from '../../model/sync-state';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { PENDING_UID } from '../shared/pending-uid';
import type { KeywordLabels } from './keyword-labels';
import { flagsDiffer, sameMembers } from './message-diff';
import type { SyncContext } from './sync-context';

export interface MailboxReconcilerDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly unitOfWork: UnitOfWork;
  readonly keywordLabels: KeywordLabels;
}

export class MailboxReconciler {
  constructor(private readonly deps: MailboxReconcilerDeps) {}

  async reset(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<void> {
    const uids = await this.deps.messages.listUids(mailbox.id);
    const threadIds = await this.deps.messages.deleteByUids(mailbox.id, uids);
    context.changes.expunged(threadIds, role);
    await this.deps.syncStates.delete(mailbox.id);
  }

  async expunges(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<void> {
    const remote = new Set(await context.provider.listUids(mailbox.path));
    const local = await this.deps.messages.listUids(mailbox.id);
    const missing = local.filter((uid) => uid !== PENDING_UID && !remote.has(uid));
    if (missing.length === 0) {
      return;
    }
    const threadIds = await this.deps.messages.deleteByUids(mailbox.id, missing);
    context.changes.expunged(threadIds, role);
  }

  async flagChanges(
    context: SyncContext,
    mailbox: Mailbox,
    state: MailboxSyncState,
    status: RemoteMailboxStatus,
  ): Promise<void> {
    const since = changedSince(state, status);
    if (since === null) {
      return;
    }
    const changes = context.provider.fetchFlagChanges(mailbox.path, since);
    for await (const change of changes) {
      const message = await this.deps.messages.findByLocation({
        mailboxId: mailbox.id,
        uid: change.uid,
      });
      if (message === null) {
        continue;
      }
      const changed = await this.deps.unitOfWork.run(async (repositories) => {
        const labelIds = await this.deps.keywordLabels.resolve(
          repositories.labels,
          context.account.id,
          change.keywords,
        );
        const flags = { ...change.flags };
        const flagsChanged = flagsDiffer(flags, message.flags);
        const labelsChanged = !sameMembers(labelIds, message.labelIds);
        if (flagsChanged) {
          await repositories.messages.updateFlags(message.id, flags);
        }
        if (labelsChanged) {
          await repositories.messages.updateLabels(message.id, labelIds);
        }
        return flagsChanged || labelsChanged;
      });
      if (changed) {
        context.changes.touched(message.threadId);
      }
    }
  }
}

const FULL_SCAN = '0';

const changedSince = (state: MailboxSyncState, status: RemoteMailboxStatus): string | null => {
  if (state.highestModseq === null || status.highestModseq === null) {
    return FULL_SCAN;
  }
  if (BigInt(status.highestModseq) <= BigInt(state.highestModseq)) {
    return null;
  }
  return state.highestModseq;
};
