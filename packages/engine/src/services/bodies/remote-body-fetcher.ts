import type { MailAccount, Message } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageParser } from '../../ports/message-parser';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { RemoteBody } from './remote-body-cache';

export type RemoteBodyOutcome =
  | { readonly kind: 'body'; readonly body: RemoteBody }
  | { readonly kind: 'missing' }
  | { readonly kind: 'offline' };

export interface RemoteBodyFetcherDeps {
  readonly sessions: LingeringSessions;
  readonly mailboxes: MailboxRepository;
  readonly parser: MessageParser;
  readonly logger: Logger;
}

const MISSING: RemoteBodyOutcome = { kind: 'missing' };
const OFFLINE: RemoteBodyOutcome = { kind: 'offline' };
const UNREACHABLE: unique symbol = Symbol('unreachable');

export class RemoteBodyFetcher {
  constructor(private readonly deps: RemoteBodyFetcherDeps) {}

  async fetch(account: MailAccount, message: Message): Promise<RemoteBodyOutcome> {
    const mailbox = await this.deps.mailboxes.findById(message.mailboxId);
    if (mailbox === null || message.uid === PENDING_UID) {
      return MISSING;
    }
    const raw = await this.read(account, mailbox.path, message.uid);
    if (raw === UNREACHABLE) {
      return OFFLINE;
    }
    return raw === null ? MISSING : this.parse(raw, message);
  }

  private async read(
    account: MailAccount,
    path: string,
    uid: number,
  ): Promise<RawMessage | null | typeof UNREACHABLE> {
    try {
      return await this.deps.sessions.with(account, (provider) => provider.fetchMessage(path, uid));
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
