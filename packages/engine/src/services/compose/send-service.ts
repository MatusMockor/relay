import type { DraftContent, ThreadId, UserId } from '@relay/shared/domain';
import { NotFoundError, ProviderError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { CredentialVault } from '../../ports/credential-vault';
import type { MailSender } from '../../ports/mail-sender';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { OutgoingMessageBuilder } from './outgoing-message-builder';
import type { SentMessageRecorder } from './sent-message-recorder';

export interface SentOutcome {
  readonly messageIdHeader: string | null;
  readonly threadId: ThreadId | null;
}

export interface SendServiceDeps {
  readonly accounts: AccountRepository;
  readonly vault: CredentialVault;
  readonly sender: MailSender;
  readonly builder: OutgoingMessageBuilder;
  readonly recorder: SentMessageRecorder;
}

export class SendService {
  constructor(private readonly deps: SendServiceDeps) {}

  async sendNow(userId: UserId, content: DraftContent): Promise<SentOutcome> {
    if (content.to.length + content.cc.length + content.bcc.length === 0) {
      throw new ValidationError('A message needs at least one recipient');
    }
    const account = await this.deps.accounts.findById(userId, content.accountId);
    if (account === null) {
      throw new NotFoundError('Account', content.accountId);
    }
    const credentials = await this.deps.vault.get(account.id);
    if (credentials === null) {
      throw new ProviderError(`No credentials stored for account ${account.email}`);
    }
    const outgoing = await this.deps.builder.build(userId, account, content);
    const sent = await this.deps.sender
      .send(account, credentials, outgoing)
      .catch((error: unknown) => {
        throw new ProviderError(`Sending failed: ${errorMessage(error)}`, { cause: error });
      });
    const threadId = await this.deps.recorder.record(userId, account, sent);
    return {
      messageIdHeader: sent.messageIdHeader,
      threadId: threadId ?? content.inReplyToThreadId,
    };
  }
}
