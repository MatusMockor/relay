import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxSyncState } from '../../model/sync-state';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { PENDING_UID } from '../shared/pending-uid';
import type { MailboxPass } from './mailbox-pass';
import { flagsDiffer, sameMembers } from './message-diff';
import type { MessageLabelsResolver } from './message-labels-resolver';
import type { SyncContext } from './sync-context';

export interface MailboxReconcilerDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly unitOfWork: UnitOfWork;
  readonly labelsResolver: MessageLabelsResolver;
}

export class MailboxReconciler {
  constructor(private readonly deps: MailboxReconcilerDeps) {}

  async reset(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<void> {
    const uids = await this.deps.messages.listUids(mailbox.id);
    await this.expunge(context, mailbox, role, uids);
    await this.deps.syncStates.delete(mailbox.id);
  }

  async expunges(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<void> {
    const remote = new Set(await context.provider.listUids(mailbox.path));
    const local = await this.deps.messages.listUids(mailbox.id);
    const missing = local.filter((uid) => uid !== PENDING_UID && !remote.has(uid));
    if (missing.length === 0) {
      return;
    }
    await this.expunge(context, mailbox, role, missing);
  }

  private expunge(
    context: SyncContext,
    mailbox: Mailbox,
    role: MailboxRole,
    uids: readonly number[],
  ): Promise<void> {
    return this.deps.unitOfWork.run(async (repositories) => {
      const threadIds = await repositories.messages.deleteByUids(mailbox.id, uids);
      await context.journal.expunged(repositories.pendingWork, threadIds, role);
    });
  }

  async flagChanges(
    context: SyncContext,
    pass: MailboxPass,
    state: MailboxSyncState,
    rescanLabels: boolean,
  ): Promise<void> {
    const { mailbox } = pass;
    if (rescanLabels) {
      const uids = await this.deps.messages.listUids(mailbox.id);
      await this.apply(
        context,
        mailbox,
        FULL_SCAN,
        uids.filter((uid) => uid !== PENDING_UID),
      );
      return;
    }
    const since = changedSince(state, pass.status);
    if (since === null) {
      return;
    }
    await this.apply(context, mailbox, since, undefined);
  }

  private async apply(
    context: SyncContext,
    mailbox: Mailbox,
    since: string,
    uids: readonly number[] | undefined,
  ): Promise<void> {
    const changes = context.provider.fetchFlagChanges(mailbox.path, since, uids);
    for await (const change of changes) {
      const message = await this.deps.messages.findByLocation({
        mailboxId: mailbox.id,
        uid: change.uid,
      });
      if (message === null) {
        continue;
      }
      await this.deps.unitOfWork.run(async (repositories) => {
        const labelIds = await this.deps.labelsResolver.resolve(
          repositories.labels,
          context.account.id,
          change,
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
        if (flagsChanged || labelsChanged) {
          await context.journal.touched(repositories.pendingWork, message.threadId);
        }
      });
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
