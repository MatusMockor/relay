import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { Mailbox, Message, ThreadId } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const SUBJECT = 'Zmluva na podpis';
const MESSAGE_ID = '<imap-copies-1@relay.test>';

const seenOnServer = async (client: ImapFlow, path: string): Promise<boolean[]> => {
  const lock = await client.getMailboxLock(path);
  try {
    const flags: boolean[] = [];
    for await (const message of client.fetch('1:*', { flags: true })) {
      flags.push(message.flags?.has('\\Seen') ?? false);
    }
    return flags;
  } finally {
    lock.release();
  }
};

const markSeenOnServer = async (client: ImapFlow, path: string): Promise<void> => {
  const lock = await client.getMailboxLock(path);
  try {
    await client.messageFlagsAdd('1:*', ['\\Seen']);
  } finally {
    lock.release();
  }
};

describe('generic IMAP copies of one Message-ID', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;
  let folderPath: string;

  beforeAll(async () => {
    owner = await createGreenMailUser('copies');
    ownerImap = await openImap(owner);
    folderPath = (await ownerImap.mailboxCreate(['Projekty'])).path;
    const mail = rawMail({
      from: 'jana@klient.test',
      to: owner.email,
      subject: SUBJECT,
      body: 'Posielam zmluvu.',
      messageId: MESSAGE_ID,
    });
    await ownerImap.append('INBOX', mail);
    await ownerImap.append(folderPath, mail);
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  const copiesOf = async (token: string, id: ThreadId): Promise<Message[]> =>
    (await app.api.ok(api.threads.get, { params: { id } }, token)).messages;

  const seenBy = (messages: readonly Message[], mailbox: Mailbox) =>
    messages.filter((message) => message.mailboxId === mailbox.id).map(({ flags }) => flags.seen);

  it('keeps two messages with their own \\Seen flag after a flag change on one copy', async () => {
    const token = (await registerUser(app.api, `copies-${owner.email}`)).accessToken;
    const account = await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (items) => items.length === 1);
    const mailboxes = await app.api.ok(
      api.accounts.mailboxes,
      { params: { id: account.id } },
      token,
    );
    const inbox = mailboxes.find(({ role }) => role === 'inbox');
    const folder = mailboxes.find(({ path }) => path === folderPath);
    expect(thread?.subject).toBe(SUBJECT);
    if (thread === undefined || inbox === undefined || folder === undefined) {
      return;
    }
    await expect.poll(async () => (await copiesOf(token, thread.id)).length).toBe(2);
    const copies = await copiesOf(token, thread.id);
    expect(new Set(copies.map(({ id }) => id)).size).toBe(2);
    expect(copies.map(({ placements }) => placements.length)).toEqual([1, 1]);

    await markSeenOnServer(ownerImap, 'INBOX');
    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, token);

    await expect
      .poll(async () => seenBy(await copiesOf(token, thread.id), inbox), { timeout: 20_000 })
      .toEqual([true]);
    expect(seenBy(await copiesOf(token, thread.id), folder)).toEqual([false]);
    expect(await seenOnServer(ownerImap, 'INBOX')).toEqual([true]);
    expect(await seenOnServer(ownerImap, folderPath)).toEqual([false]);
  }, 60_000);
});
