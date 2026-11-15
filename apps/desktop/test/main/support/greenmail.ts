import { randomBytes } from 'node:crypto';
import { testInfra } from '@relay/config/test-infra';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import { expect } from 'vitest';

const { greenmail } = testInfra;

export interface GreenMailAccount {
  readonly email: string;
  readonly password: string;
  readonly host: string;
  readonly imapPort: number;
  readonly smtpPort: number;
  remove(): Promise<void>;
}

export const createGreenMailAccount = async (): Promise<GreenMailAccount> => {
  const email = `desktop-${randomBytes(6).toString('hex')}@relay.test`;
  const password = `pw-${randomBytes(6).toString('hex')}`;
  const response = await fetch(`${greenmail.apiUrl}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, login: email, password }),
  });
  expect(response.status).toBe(200);
  return {
    email,
    password,
    host: greenmail.host,
    imapPort: greenmail.imapPort,
    smtpPort: greenmail.smtpPort,
    remove: async () => {
      await fetch(`${greenmail.apiUrl}/api/user/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
    },
  };
};

export const deliverMail = async (
  account: GreenMailAccount,
  mail: {
    readonly from: string;
    readonly subject: string;
    readonly text: string;
    readonly attachments?: readonly {
      readonly filename: string;
      readonly contentType: string;
      readonly content: Buffer;
    }[];
  },
): Promise<void> => {
  const transport = createTransport({
    host: account.host,
    port: account.smtpPort,
    secure: false,
    auth: { user: account.email, pass: account.password },
  });
  await transport.sendMail({
    ...mail,
    attachments: mail.attachments?.map((attachment) => ({ ...attachment })),
    to: account.email,
  });
  transport.close();
};

export const withImap = async <Result>(
  account: GreenMailAccount,
  work: (client: ImapFlow) => Promise<Result>,
): Promise<Result> => {
  const client = new ImapFlow({
    host: account.host,
    port: account.imapPort,
    secure: false,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.logout();
  }
};

export const subjectsIn = (account: GreenMailAccount, path: string): Promise<string[]> =>
  withImap(account, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const subjects: string[] = [];
      if (client.mailbox === false || client.mailbox.exists === 0) {
        return subjects;
      }
      for await (const message of client.fetch('1:*', { envelope: true })) {
        subjects.push(message.envelope?.subject ?? '');
      }
      return subjects.sort();
    } finally {
      lock.release();
    }
  });
