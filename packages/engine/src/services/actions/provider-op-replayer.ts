import type { MailAccount, Mailbox, Message } from '@relay/shared/domain';
import { PartialMoveError } from '../../errors';
import type { ProviderChange } from '../../model/pending-work';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { KeyedSerializer } from '../shared/keyed-serializer';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { PendingProviderOp } from '../shared/provider-ops';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';

interface OpBatch {
  readonly mailbox: Mailbox;
  readonly change: ProviderChange;
  readonly ops: PendingProviderOp[];
  readonly messages: Message[];
}

export interface ProviderOpReplayerDeps {
  readonly messages: MessageRepository;
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly logger: Logger;
}

export class ProviderOpReplayer {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: ProviderOpReplayerDeps) {}

  replayPending(account: MailAccount, provider: MailProvider): Promise<void> {
    return this.serializer.run(account.id, async () => {
      const ops = await this.deps.pendingWork.list(account.id, 'provider-op');
      await this.apply(account, provider, ops);
    });
  }

  replay(
    account: MailAccount,
    provider: MailProvider,
    ops: readonly PendingProviderOp[],
  ): Promise<void> {
    return this.serializer.run(account.id, async () => {
      await this.apply(account, provider, await this.stillPending(ops));
    });
  }

  private async stillPending(ops: readonly PendingProviderOp[]): Promise<PendingProviderOp[]> {
    const current: PendingProviderOp[] = [];
    for (const op of ops) {
      const stored = await this.deps.pendingWork.find(op);
      if (stored?.revision === op.revision) {
        current.push(stored);
      }
    }
    return current;
  }

  private async apply(
    account: MailAccount,
    provider: MailProvider,
    ops: readonly PendingProviderOp[],
  ): Promise<void> {
    const batches = await this.batches(account, ops);
    const ordered = [
      ...batches.filter((batch) => batch.change.kind !== 'move'),
      ...batches.filter((batch) => batch.change.kind === 'move'),
    ];
    for (const batch of ordered) {
      try {
        await this.applyBatch(account, provider, batch);
        await this.deps.pendingWork.remove(batch.ops);
      } catch (error) {
        this.deps.logger.warn('Mirroring a thread action to the mail provider failed', {
          accountId: account.id,
          error: errorMessage(error),
        });
      }
    }
  }

  private async applyBatch(account: MailAccount, provider: MailProvider, batch: OpBatch) {
    const uids = batch.messages.map((message) => message.uid);
    const { change, mailbox } = batch;
    if (change.kind === 'flag') {
      const flags = [change.flag];
      await provider.setFlags(
        mailbox.path,
        uids,
        change.value ? { add: flags, remove: [] } : { add: [], remove: flags },
      );
      return;
    }
    if (change.kind === 'keyword') {
      const keywords = [change.keyword];
      await provider.setKeywords(
        mailbox.path,
        uids,
        change.value ? { add: keywords, remove: [] } : { add: [], remove: keywords },
      );
      return;
    }
    if (mailbox.role === change.role) {
      return;
    }
    const target = await this.deps.roleMailboxes.ensure(account, change.role, provider);
    if (target === null) {
      throw new Error(`No ${change.role} mailbox to move messages to`);
    }
    const uidMap = await this.move(account, provider, mailbox.path, uids, target.path);
    for (const message of batch.messages) {
      await this.deps.messages.move(message.id, {
        mailboxId: target.id,
        uid: uidMap.get(message.uid) ?? PENDING_UID,
      });
    }
  }

  private async move(
    account: MailAccount,
    provider: MailProvider,
    sourcePath: string,
    uids: readonly number[],
    targetPath: string,
  ): Promise<ReadonlyMap<number, number>> {
    try {
      return (await provider.move(sourcePath, uids, targetPath)).uidMap;
    } catch (error) {
      if (!(error instanceof PartialMoveError)) {
        throw error;
      }
      this.deps.logger.warn('A move left the copied messages in the target mailbox', {
        accountId: account.id,
        sourcePath,
        targetPath,
      });
      return error.uidMap;
    }
  }

  private async batches(
    account: MailAccount,
    ops: readonly PendingProviderOp[],
  ): Promise<OpBatch[]> {
    const batches = new Map<string, OpBatch>();
    const gone: PendingProviderOp[] = [];
    for (const op of ops) {
      const message = await this.deps.messages.findById(account.userId, op.payload.messageId);
      if (message === null) {
        gone.push(op);
        continue;
      }
      if (message.uid === PENDING_UID) {
        continue;
      }
      const key = `${message.mailboxId}|${JSON.stringify(op.payload.change)}`;
      const known = batches.get(key) ?? (await this.batch(message, op));
      if (known === null) {
        continue;
      }
      known.ops.push(op);
      known.messages.push(message);
      batches.set(key, known);
    }
    await this.deps.pendingWork.remove(gone);
    return [...batches.values()];
  }

  private async batch(message: Message, op: PendingProviderOp): Promise<OpBatch | null> {
    const mailbox = await this.deps.mailboxes.findById(message.mailboxId);
    return mailbox === null ? null : { mailbox, change: op.payload.change, ops: [], messages: [] };
  }
}
