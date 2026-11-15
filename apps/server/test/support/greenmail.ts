import { randomUUID } from 'node:crypto';
import { type GreenMailUser, testInfra } from '@relay/config/test-infra';
import type { ImapSmtpSettings } from '@relay/shared/domain';
import { ImapFlow } from 'imapflow';
import { expect } from 'vitest';

const { greenmail } = testInfra;

export const createGreenMailUser = async (prefix = 'srv'): Promise<GreenMailUser> => {
  const id = randomUUID().slice(0, 12);
  const email = `${prefix}-${id}@relay.test`;
  const user = { email, login: email, password: `pw-${id}` };
  const response = await fetch(`${greenmail.apiUrl}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  expect(response.ok).toBe(true);
  return user;
};

export const deleteGreenMailUser = async (user: GreenMailUser): Promise<void> => {
  await fetch(`${greenmail.apiUrl}/api/user/${encodeURIComponent(user.email)}`, {
    method: 'DELETE',
  });
};

export const greenMailSettings = (user: GreenMailUser): ImapSmtpSettings => ({
  imap: { host: greenmail.host, port: greenmail.imapPort, secure: false },
  smtp: { host: greenmail.host, port: greenmail.smtpPort, secure: false },
  username: user.login,
});

export const openImap = async (user: GreenMailUser): Promise<ImapFlow> => {
  const client = new ImapFlow({
    host: greenmail.host,
    port: greenmail.imapPort,
    secure: false,
    auth: { user: user.login, pass: user.password },
    logger: false,
  });
  await client.connect();
  return client;
};

export interface TestMail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly messageId?: string;
}

export const rawMail = (mail: TestMail): Buffer =>
  Buffer.from(
    [
      `From: ${mail.from}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      `Message-ID: ${mail.messageId ?? `<${randomUUID()}@relay.test>`}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      mail.body,
      '',
    ].join('\r\n'),
  );

export const listSubjects = async (client: ImapFlow, path: string): Promise<string[]> => {
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = client.mailbox;
    if (mailbox === false || mailbox.exists === 0) {
      return [];
    }
    const subjects: string[] = [];
    for await (const message of client.fetch('1:*', { envelope: true })) {
      subjects.push(message.envelope?.subject ?? '');
    }
    return subjects;
  } finally {
    lock.release();
  }
};
