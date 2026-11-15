import type { ConnectionCheck, TestConnectionResponse } from '@relay/shared/api';
import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { MailProviderFactory } from '../../ports/mail-provider-factory';
import type { MailSender } from '../../ports/mail-sender';
import { errorMessage } from '../shared/mail-provider-sessions';

const check = async (probe: () => Promise<void>): Promise<ConnectionCheck> => {
  try {
    await probe();
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
};

export class ConnectionTester {
  constructor(
    private readonly providers: MailProviderFactory,
    private readonly sender: MailSender,
  ) {}

  async test(
    account: MailAccount,
    credentials: AccountCredentials,
  ): Promise<TestConnectionResponse> {
    const imap = await check(async () => {
      const provider = this.providers.create(account, credentials);
      try {
        await provider.connect();
        await provider.listMailboxes();
      } finally {
        await provider.close().catch(() => undefined);
      }
    });
    const smtp = await check(() => this.sender.verify(account, credentials));
    return { imap, smtp };
  }
}

export const describeFailure = (result: TestConnectionResponse): string | null => {
  const failures = [
    ...(result.imap.ok ? [] : [`IMAP: ${result.imap.error ?? 'unknown error'}`]),
    ...(result.smtp.ok ? [] : [`SMTP: ${result.smtp.error ?? 'unknown error'}`]),
  ];
  return failures.length === 0 ? null : failures.join('; ');
};
