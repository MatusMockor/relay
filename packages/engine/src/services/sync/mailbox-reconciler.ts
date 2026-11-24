import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxSyncState } from '../../model/sync-state';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { MailboxPass } from './mailbox-pass';
import { flagsDiffer, sameMembers } from './message-diff';
import type { MessageLabelsResolver } from './message-labels-resolver';
import type { ReconcileScans } from './reconcile-scans';
import type { SyncContext } from './sync-context';
import { syncedFlags } from './synced-flags';

export interface MailboxReconcilerDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly unitOfWork: UnitOfWork;
  readonly labelsResolver: MessageLabelsResolver;
  readonly scans: ReconcileScans;
}

export class MailboxReconciler {
  constructor(private readonly deps: MailboxReconcilerDeps) {}

  async reset(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<void> {
    await this.deps.unitOfWork.run(async (repositories) => {
      const { messages } = repositories;
      const threadIds = await messages.deleteByUids(
        mailbox.id,
        await messages.listUids(mailbox.id),
      );
      await context.journal.expunged(repositories.pendingWork, threadIds, role);
    });
    await this.deps.syncStates.delete(mailbox.id);
    this.deps.scans.forget(mailbox.id);
  }

  async expunges(context: SyncContext, pass: MailboxPass): Promise<void> {
    const { mailbox, role } = pass;
    const local = await this.storedUids(mailbox);
    if (await this.deps.scans.skipsExpungeDiff(pass, local.length)) {
      return;
    }
    const remote = new Set(await this.remaining(context, mailbox, local));
    this.deps.scans.fullExpungeDiffDone(mailbox.id);
    const missing = local.filter((uid) => !remote.has(uid));
    if (missing.length === 0) {
      return;
    }
    await this.expunge(context, mailbox, role, missing);
  }

  private remaining(
    context: SyncContext,
    mailbox: Mailbox,
    local: readonly number[],
  ): Promise<number[]> {
    if (local.length === 0) {
      return Promise.resolve([]);
    }
    return context.provider.listUids(mailbox.path, { among: local });
  }

  private storedUids(mailbox: Mailbox): Promise<number[]> {
    return this.deps.messages.listUids(mailbox.id);
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
      await this.apply(context, mailbox, FULL_SCAN, await this.storedUids(mailbox));
      return;
    }
    if (pass.status.highestModseq === null) {
      const uids = await this.storedUids(mailbox);
      const scanned = await this.deps.scans.flagScanUids(mailbox.id, uids);
      await this.apply(context, mailbox, FULL_SCAN, scanned);
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
          repositories,
          context.account.id,
          change,
        );
        const flags = await syncedFlags(repositories.pendingWork, message, change.flags);
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
