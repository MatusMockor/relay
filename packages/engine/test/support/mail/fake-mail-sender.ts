import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { MailSender, OutgoingMessage, SentMessage } from '../../../src';
import { buildRawMessage } from './raw-message';

export interface SentRecord {
  readonly account: MailAccount;
  readonly message: OutgoingMessage;
  readonly sent: SentMessage;
}

export class FakeMailSender implements MailSender {
  readonly sent: SentRecord[] = [];
  failSend: string | null = null;
  failVerify: string | null = null;
  date = '2026-11-15T09:00:00.000Z';
  beforeSend: (() => Promise<void>) | null = null;

  async send(
    account: MailAccount,
    _credentials: AccountCredentials,
    message: OutgoingMessage,
  ): Promise<SentMessage> {
    await this.beforeSend?.();
    if (this.failSend !== null) {
      return Promise.reject(new Error(this.failSend));
    }
    const messageIdHeader = `<sent-${this.sent.length + 1}@relay.test>`;
    const raw = buildRawMessage({
      messageId: messageIdHeader,
      from: message.from,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      date: this.date,
      body: message.text,
      inReplyTo: message.inReplyTo,
      references: message.references,
    });
    const recipients = [...message.to, ...message.cc, ...message.bcc].map(
      (address) => address.email,
    );
    const sent: SentMessage = {
      messageIdHeader,
      raw,
      acceptedRecipients: recipients,
      rejectedRecipients: [],
    };
    this.sent.push({ account, message, sent });
    return sent;
  }

  verify(_account: MailAccount, _credentials: AccountCredentials): Promise<void> {
    if (this.failVerify !== null) {
      return Promise.reject(new Error(this.failVerify));
    }
    return Promise.resolve();
  }
}
