import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { OutgoingMessage, SentMessage } from '../model/outgoing-message';

export interface MailSender {
  send(
    account: MailAccount,
    credentials: AccountCredentials,
    message: OutgoingMessage,
  ): Promise<SentMessage>;
  verify(account: MailAccount, credentials: AccountCredentials): Promise<void>;
}
