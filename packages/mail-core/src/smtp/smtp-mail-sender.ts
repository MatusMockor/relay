import {
  ProviderError,
  isEngineError,
  type MailSender,
  type OutgoingMessage,
  type SentMessage,
} from '@relay/engine';
import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { ConnectionOptions } from 'node:tls';
import { CredentialsMailAuthResolver } from '../auth/credentials-mail-auth-resolver';
import type { OAuthTokenProvider } from '../auth/oauth-token-provider';
import { composeMime } from './compose-mime';
import { createSmtpTransport, DEFAULT_SMTP_TIMEOUTS, type SmtpTimeouts } from './smtp-transport';

export interface SmtpMailSenderOptions {
  readonly tokens: OAuthTokenProvider;
  readonly timeouts?: SmtpTimeouts;
  readonly tls?: ConnectionOptions;
  readonly allowPlaintext?: boolean;
}

const toAddressList = (values: readonly (string | { address: string })[]): string[] =>
  values.map((value) => (typeof value === 'string' ? value : value.address));

const toSendError = (operation: string, error: unknown): Error => {
  if (isEngineError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderError(`SMTP ${operation} failed: ${message}`, { cause: error });
};

export class SmtpMailSender implements MailSender {
  constructor(private readonly options: SmtpMailSenderOptions) {}

  async send(
    account: MailAccount,
    credentials: AccountCredentials,
    message: OutgoingMessage,
  ): Promise<SentMessage> {
    const mime = await composeMime(message);
    const transport = await this.transport(account, credentials);
    try {
      const info = await transport.sendMail({ envelope: mime.envelope, raw: mime.raw });
      return {
        messageIdHeader: mime.messageIdHeader,
        sentCopy: new Uint8Array(mime.sentCopy),
        acceptedRecipients: toAddressList(info.accepted),
        rejectedRecipients: toAddressList(info.rejected),
      };
    } catch (error) {
      throw toSendError('send', error);
    } finally {
      transport.close();
    }
  }

  async verify(account: MailAccount, credentials: AccountCredentials): Promise<void> {
    const transport = await this.transport(account, credentials);
    try {
      await transport.verify();
    } catch (error) {
      throw toSendError('verify', error);
    } finally {
      transport.close();
    }
  }

  private async transport(account: MailAccount, credentials: AccountCredentials) {
    const auth = await new CredentialsMailAuthResolver(
      account,
      credentials,
      this.options.tokens,
    ).resolve();
    return createSmtpTransport({
      endpoint: account.settings.smtp,
      auth,
      timeouts: this.options.timeouts ?? DEFAULT_SMTP_TIMEOUTS,
      tls: this.options.tls,
      allowPlaintext: this.options.allowPlaintext,
    });
  }
}
