import type { CreateAccountBody } from '@relay/shared/api';
import { createTransport } from 'nodemailer';
import { expect } from 'vitest';
import {
  createGreenMailAccount,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from '../../../main/support/greenmail';

export type ImapAccountBody = Extract<CreateAccountBody, { provider: 'imap' }>;

export const createMailbox = async (): Promise<GreenMailAccount> => {
  const account = await createGreenMailAccount();
  await withImap(account, async (client) => {
    await client.mailboxCreate('Archive');
    await client.mailboxCreate('Sent');
  });
  return account;
};

export const imapAccount = (mailbox: GreenMailAccount): ImapAccountBody => ({
  provider: 'imap',
  email: mailbox.email,
  displayName: 'Práca',
  settings: {
    imap: { host: mailbox.host, port: mailbox.imapPort, secure: false },
    smtp: { host: mailbox.host, port: mailbox.smtpPort, secure: false },
    username: mailbox.email,
  },
  password: mailbox.password,
});

export const sendMail = async (
  from: GreenMailAccount,
  to: GreenMailAccount,
  subject: string,
  text: string,
): Promise<void> => {
  const transport = createTransport({
    host: from.host,
    port: from.smtpPort,
    secure: false,
    auth: { user: from.email, pass: from.password },
  });
  await transport.sendMail({ from: from.email, to: to.email, subject, text });
  transport.close();
  await expect.poll(() => subjectsIn(to, 'INBOX'), { timeout: 10_000 }).toContain(subject);
};

export interface ReceivedMail {
  readonly subject: string;
  readonly inReplyTo: string | null;
  readonly messageId: string | null;
}

export const receivedIn = (account: GreenMailAccount, path: string): Promise<ReceivedMail[]> =>
  withImap(account, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const received: ReceivedMail[] = [];
      if (client.mailbox === false || client.mailbox.exists === 0) {
        return received;
      }
      for await (const message of client.fetch('1:*', { envelope: true })) {
        received.push({
          subject: message.envelope?.subject ?? '',
          inReplyTo: message.envelope?.inReplyTo ?? null,
          messageId: message.envelope?.messageId ?? null,
        });
      }
      return received;
    } finally {
      lock.release();
    }
  });
