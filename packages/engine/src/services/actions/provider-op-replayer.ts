import type { AccountId, MailAccount } from '@relay/shared/domain';
import { PartialMoveError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { KeywordPurger } from '../labels/keyword-purger';
import { KeyedSerializer } from '../shared/keyed-serializer';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { PendingProviderOp } from '../shared/provider-ops';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { MovedCopyMerger } from './moved-copy-merger';
import { MoveTargetResolver } from './move-target-resolver';
import { type OpBatch, ProviderOpBatches } from './provider-op-batches';
import { writeStoreChange } from './store-change-writer';

export interface ProviderOpReplayerDeps {
  readonly messages: MessageRepository;
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class ProviderOpReplayer {
  private readonly serializer = new KeyedSerializer();
  private readonly targets: MoveTargetResolver;
  private readonly merger: MovedCopyMerger;
  private readonly purger: KeywordPurger;
  private readonly batches: ProviderOpBatches;

  constructor(private readonly deps: ProviderOpReplayerDeps) {
    this.targets = new MoveTargetResolver(deps.mailboxes, deps.roleMailboxes);
    this.merger = new MovedCopyMerger(deps);
    this.purger = new KeywordPurger(deps);
    this.batches = new ProviderOpBatches(deps);
  }

  replayPending(account: MailAccount, provider: MailProvider): Promise<void> {
    return this.serializer.run(account.id, async () => {
      const ops = await this.deps.pendingWork.list(account.id, 'provider-op');
      await this.apply(account, provider, ops);
      await this.purger.purgePending(account, provider);
    });
  }

  purgeKeywords(account: MailAccount, provider: MailProvider): Promise<void> {
    return this.serializer.run(account.id, () => this.purger.purgePending(account, provider));
  }

  expireKeywordPurges(accountId: AccountId, syncStartedAt: string): Promise<void> {
    return this.serializer.run(accountId, () => this.purger.expire(accountId, syncStartedAt));
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
    const batches = await this.batches.of(account, ops);
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
    const uids = batch.entries.map(({ placement }) => placement.uid);
    const { change, mailbox } = batch;
    if (change.kind !== 'move') {
      await writeStoreChange(provider, mailbox.path, uids, change);
      return;
    }
    if (change.mailboxId === undefined && mailbox.role === change.role) {
      return;
    }
    const target = await this.targets.resolve(account, provider, change);
    if (target.id === mailbox.id) {
      return;
    }
    const uidMap = await this.move(account, provider, mailbox.path, uids, target.path);
    for (const { message, placement } of batch.entries) {
      const uid = uidMap.get(placement.uid) ?? PENDING_UID;
      const twin = await this.merger.twinOf(account, message, target, uid);
      if (twin !== null) {
        await this.merger.merge(account, message, placement, twin);
        continue;
      }
      await this.deps.messages.move(message.id, { mailboxId: target.id, uid });
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
}
