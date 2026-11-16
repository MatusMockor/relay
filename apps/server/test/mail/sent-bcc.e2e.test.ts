import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const BCC_HEADER = /^Bcc:/im;

const unfold = (source: string): string => source.replace(/\r?\n[ \t]+/g, ' ');

const sourcesIn = async (client: ImapFlow, path: string): Promise<string[]> => {
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = client.mailbox;
    if (mailbox === false || mailbox.exists === 0) {
      return [];
    }
    const sources: string[] = [];
    for await (const message of client.fetch('1:*', { source: true })) {
      sources.push(message.source?.toString('utf8') ?? '');
    }
    return sources;
  } finally {
    lock.release();
  }
};

const receivedBy = async (client: ImapFlow): Promise<string> => {
  let sources: string[] = [];
  await expect
    .poll(
      async () => {
        sources = await sourcesIn(client, 'INBOX');
        return sources.length;
      },
      { timeout: 10_000 },
    )
    .toBe(1);
  return sources[0] ?? '';
};

describe('synced Sent copy with Bcc', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let partner: GreenMailUser;
  let hidden: GreenMailUser;
  let ownerImap: ImapFlow;
  let partnerImap: ImapFlow;
  let hiddenImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('bccowner');
    partner = await createGreenMailUser('bccpartner');
    hidden = await createGreenMailUser('bcchidden');
    ownerImap = await openImap(owner);
    partnerImap = await openImap(partner);
    hiddenImap = await openImap(hidden);
    await ownerImap.append(
      'INBOX',
      rawMail({ from: partner.email, to: owner.email, subject: 'Ahoj', body: 'Ahoj!' }),
    );
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([ownerImap, partnerImap, hiddenImap].map((client) => client.logout()));
    await Promise.all([owner, partner, hidden].map((user) => deleteGreenMailUser(user)));
  });

  it('keeps Bcc on the stored sent message but never in what recipients receive', async () => {
    const session = await registerUser(app.api, `bcc-${owner.email}`);
    const token = session.accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 1);

    const sent = await app.api.ok(
      api.compose.send,
      {
        body: {
          source: 'inline',
          draft: {
            accountId: account.id,
            to: [{ name: null, email: partner.email }],
            cc: [],
            bcc: [{ name: 'Skrytý Príjemca', email: hidden.email }],
            subject: 'Ponuka',
            body: 'Posielam ponuku.',
            inReplyToThreadId: null,
            inReplyToMessageId: null,
          },
        },
      },
      token,
    );
    expect(sent.status).toBe('sent');
    const threadId = sent.status === 'sent' ? sent.threadId : null;
    expect(threadId).not.toBeNull();
    if (threadId === null) {
      return;
    }

    expect(await receivedBy(partnerImap)).not.toMatch(BCC_HEADER);
    expect(await receivedBy(hiddenImap)).not.toMatch(BCC_HEADER);
    const [copy] = await sourcesIn(ownerImap, 'Sent');
    expect(unfold(copy ?? '')).toMatch(new RegExp(`^Bcc: .*<${hidden.email}>`, 'im'));

    const expected = [{ name: 'Skrytý Príjemca', email: hidden.email }];
    const detail = await app.api.ok(api.threads.get, { params: { id: threadId } }, token);
    expect(detail.messages.map((message) => message.bcc)).toEqual([expected]);

    app.clock.advance(1000);
    const resyncedAt = app.clock.now().toISOString();
    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, token);
    await expect
      .poll(
        async () => {
          const accounts = await app.api.ok(api.accounts.list, {}, token);
          return accounts.find((item) => item.id === account.id)?.lastSyncedAt;
        },
        { timeout: 10_000 },
      )
      .toBe(resyncedAt);
    const resynced = await app.api.ok(api.threads.get, { params: { id: threadId } }, token);
    expect(resynced.messages.map((message) => message.bcc)).toEqual([expected]);
  }, 60_000);
});
