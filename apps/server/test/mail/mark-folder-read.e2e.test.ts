import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const SUBJECTS = ['Porada o 10', 'Faktúra 42', 'Obed v piatok?'];

const seenCount = async (client: ImapFlow): Promise<number> => {
  const lock = await client.getMailboxLock('INBOX');
  try {
    const seen = await client.search({ seen: true }, { uid: true });
    return seen === false ? 0 : seen.length;
  } finally {
    lock.release();
  }
};

describe('mark folder read over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('markread');
    ownerImap = await openImap(owner);
    for (const subject of SUBJECTS) {
      await ownerImap.append(
        'INBOX',
        rawMail({ from: 'jana@example.com', to: owner.email, subject, body: 'Ahoj' }),
      );
    }
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  it('marks every unread thread in the inbox read locally and on IMAP', async () => {
    const session = await registerUser(app.api, `markread-${owner.email}`);
    const token = session.accessToken;
    await addImapAccount(app.api, token, owner);
    const threads = await waitForInbox(app.api, token, (items) => items.length === 3);
    expect(threads.every((thread) => thread.unread)).toBe(true);

    const result = await app.api.ok(api.threads.markFolderRead, { body: { view: 'inbox' } }, token);

    expect(result).toEqual({ count: 3 });
    await expect.poll(() => seenCount(ownerImap), { timeout: 10_000 }).toBe(3);
    const read = await waitForInbox(app.api, token, (items) =>
      items.every((thread) => !thread.unread),
    );
    expect(read).toHaveLength(3);
  }, 60_000);

  it('rejects a label folder without a label id', async () => {
    const session = await registerUser(app.api, `markread-label-${owner.email}`);

    const rejected = await app.api.fail(
      api.threads.markFolderRead,
      { body: { view: 'label' } },
      session.accessToken,
    );

    expect(rejected.status).toBe(400);
  });
});
