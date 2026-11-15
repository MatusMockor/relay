import { testInfra } from '@relay/config/test-infra';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import { afterEach, describe, expect, it } from 'vitest';

const { greenmail } = testInfra;

const imapClient = () =>
  new ImapFlow({
    host: greenmail.host,
    port: greenmail.imapPort,
    secure: false,
    auth: { user: greenmail.user.login, pass: greenmail.user.password },
    logger: false,
  });

describe('GreenMail test infrastructure', () => {
  const clients: ImapFlow[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.logout()));
  });

  it('delivers mail sent over SMTP to the IMAP inbox of the test user', async () => {
    const subject = `relay smoke ${String(Date.now())}`;
    const transport = createTransport({
      host: greenmail.host,
      port: greenmail.smtpPort,
      secure: false,
      auth: { user: greenmail.user.login, pass: greenmail.user.password },
    });
    await transport.sendMail({
      from: 'Jira <jira@relay.test>',
      to: greenmail.user.email,
      subject,
      text: 'Ahoj, toto je test.',
    });

    const client = imapClient();
    clients.push(client);
    await client.connect();
    const mailboxes = await client.list();
    expect(mailboxes.map((mailbox) => mailbox.path)).toContain('INBOX');

    const lock = await client.getMailboxLock('INBOX');
    const uids = await client.search({ subject }, { uid: true });
    expect(uids).not.toBe(false);
    const [uid] = uids === false ? [] : uids;
    expect(uid).toBeTypeOf('number');
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    lock.release();

    expect(message).not.toBe(false);
    const source = message === false ? undefined : message.source;
    expect(source).toBeInstanceOf(Buffer);
    const parsed = await simpleParser(source ?? Buffer.alloc(0));
    expect(parsed.subject).toBe(subject);
    expect(parsed.text?.trim()).toBe('Ahoj, toto je test.');
  });
});
