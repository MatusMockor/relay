import type { MailAccount, Message } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageParser } from '../../ports/message-parser';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { RemoteBody } from './remote-body-cache';
import { type MessageLocation, readVerifiedMessage } from './verified-message-read';

export type RemoteBodyOutcome =
  | { readonly kind: 'body'; readonly body: RemoteBody }
  | { readonly kind: 'missing' }
  | { readonly kind: 'offline' };

export interface RemoteBodyFetcherDeps {
  readonly sessions: LingeringSessions;
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly parser: MessageParser;
  readonly logger: Logger;
}

const MISSING: RemoteBodyOutcome = { kind: 'missing' };
const OFFLINE: RemoteBodyOutcome = { kind: 'offline' };
const UNREACHABLE: unique symbol = Symbol('unreachable');

export class RemoteBodyFetcher {
  constructor(private readonly deps: RemoteBodyFetcherDeps) {}

  async fetch(account: MailAccount, message: Message): Promise<RemoteBodyOutcome> {
    const location = await this.locate(message);
    if (location === null) {
      return MISSING;
    }
    const raw = await this.read(account, location);
    if (raw === UNREACHABLE) {
      return OFFLINE;
    }
    return raw === null ? MISSING : this.parse(raw, message);
  }

  private async locate(message: Message): Promise<MessageLocation | null> {
    if (message.uid === PENDING_UID) {
      return null;
    }
    const mailbox = await this.deps.mailboxes.findById(message.mailboxId);
    const state = mailbox === null ? null : await this.deps.syncStates.find(mailbox.id);
    if (mailbox === null || state === null) {
      return null;
    }
    return { path: mailbox.path, uid: message.uid, uidValidity: state.uidValidity };
  }

  private async read(
    account: MailAccount,
    location: MessageLocation,
  ): Promise<RawMessage | null | typeof UNREACHABLE> {
    try {
      return await this.deps.sessions.with(account, (provider) =>
        readVerifiedMessage(provider, location),
      );
    } catch (error) {
      return this.failed(account, error);
    }
  }

  private async parse(raw: RawMessage, message: Message): Promise<RemoteBodyOutcome> {
    const parsed = await this.deps.parser.parse(raw.source).catch(() => null);
    if (parsed === null) {
      return MISSING;
    }
    if (message.messageIdHeader !== null && parsed.messageIdHeader !== message.messageIdHeader) {
      return MISSING;
    }
    return { kind: 'body', body: { textBody: parsed.textBody, htmlBody: parsed.htmlBody } };
  }

  private failed(account: MailAccount, error: unknown): typeof UNREACHABLE {
    this.deps.logger.info('Remote message body is unavailable', {
      accountId: account.id,
      error: errorMessage(error),
    });
    return UNREACHABLE;
  }
}
