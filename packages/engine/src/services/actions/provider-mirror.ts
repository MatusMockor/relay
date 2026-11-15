import type { MailAccount, Mailbox, Message } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';

export interface MailboxBatch {
  readonly mailbox: Mailbox;
  readonly messages: readonly Message[];
  readonly uids: readonly number[];
}

export type MirrorOperation = (provider: MailProvider, batch: MailboxBatch) => Promise<void>;

export interface ProviderMirrorDeps {
  readonly mailboxes: MailboxRepository;
  readonly sessions: MailProviderSessions;
  readonly logger: Logger;
}

export class ProviderMirror {
  constructor(private readonly deps: ProviderMirrorDeps) {}

  async apply(
    account: MailAccount,
    messages: readonly Message[],
    operation: MirrorOperation,
  ): Promise<boolean> {
    const batches = await this.batches(messages);
    if (batches.length === 0) {
      return true;
    }
    try {
      await this.deps.sessions.with(account, async (provider) => {
        for (const batch of batches) {
          await operation(provider, batch);
        }
      });
      return true;
    } catch (error) {
      this.deps.logger.warn('Mirroring a thread action to the mail provider failed', {
        accountId: account.id,
        error: errorMessage(error),
      });
      return false;
    }
  }

  private async batches(messages: readonly Message[]): Promise<MailboxBatch[]> {
    const grouped = new Map<string, Message[]>();
    messages
      .filter((message) => message.uid !== PENDING_UID)
      .forEach((message) => {
        grouped.set(message.mailboxId, [...(grouped.get(message.mailboxId) ?? []), message]);
      });
    const batches: MailboxBatch[] = [];
    for (const group of grouped.values()) {
      const first = group[0];
      const mailbox =
        first === undefined ? null : await this.deps.mailboxes.findById(first.mailboxId);
      if (mailbox !== null) {
        batches.push({ mailbox, messages: group, uids: group.map((message) => message.uid) });
      }
    }
    return batches;
  }
}
