import {
  isPendingPlacement,
  type MailAccount,
  type Mailbox,
  type MailboxRoleOf,
  type Message,
  type MessagePlacement,
} from '@relay/shared/domain';
import type { ProviderChange } from '../../model/pending-work';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { mailboxRoleOf } from '../shared/mailbox-role-of';
import type { PendingProviderOp } from '../shared/provider-ops';
import { opPlacement } from './op-placement';

export interface BatchEntry {
  readonly message: Message;
  readonly placement: MessagePlacement;
}

export interface OpBatch {
  readonly mailbox: Mailbox;
  readonly change: ProviderChange;
  readonly ops: PendingProviderOp[];
  readonly entries: BatchEntry[];
}

export interface ProviderOpBatchesDeps {
  readonly messages: MessageRepository;
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
}

export class ProviderOpBatches {
  constructor(private readonly deps: ProviderOpBatchesDeps) {}

  async of(account: MailAccount, ops: readonly PendingProviderOp[]): Promise<OpBatch[]> {
    if (ops.length === 0) {
      return [];
    }
    const batches = new Map<string, OpBatch>();
    const gone: PendingProviderOp[] = [];
    const roleOf = await this.roleOf(account);
    for (const op of ops) {
      const message = await this.deps.messages.findById(account.userId, op.payload.messageId);
      const placement = message === null ? undefined : opPlacement(op.payload, message, roleOf);
      if (message === null || placement === undefined) {
        gone.push(op);
        continue;
      }
      if (isPendingPlacement(placement)) {
        continue;
      }
      const key = `${placement.mailboxId}|${JSON.stringify(op.payload.change)}`;
      const known = batches.get(key) ?? (await this.batch(placement, op));
      if (known === null) {
        continue;
      }
      known.ops.push(op);
      known.entries.push({ message, placement });
      batches.set(key, known);
    }
    await this.deps.pendingWork.remove(gone);
    return [...batches.values()];
  }

  private async roleOf(account: MailAccount): Promise<MailboxRoleOf> {
    return mailboxRoleOf(await this.deps.mailboxes.listForSync(account.id));
  }

  private async batch(placement: MessagePlacement, op: PendingProviderOp): Promise<OpBatch | null> {
    const mailbox = await this.deps.mailboxes.findById(placement.mailboxId);
    return mailbox === null ? null : { mailbox, change: op.payload.change, ops: [], entries: [] };
  }
}
