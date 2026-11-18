import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import {
  createGreenMailUser,
  deleteGreenMailUser,
  listSubjects,
  openImap,
  rawMail,
} from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const OFFER = 'Vyhrali ste iPhone';

describe('spam folder over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('spam');
    ownerImap = await openImap(owner);
    for (const subject of [OFFER, 'Porada o 10']) {
      await ownerImap.append(
        'INBOX',
        rawMail({ from: 'win@lotto.test', to: owner.email, subject, body: 'Ahoj' }),
      );
    }
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  it('reports a thread as spam into a created Junk mailbox and brings it back', async () => {
    const session = await registerUser(app.api, `spam-${owner.email}`);
    const token = session.accessToken;
    const account = await addImapAccount(app.api, token, owner);
    const threads = await waitForInbox(app.api, token, (items) => items.length === 2);
    const offer = threads.find((thread) => thread.subject === OFFER);
    expect(offer).toBeDefined();
    if (offer === undefined) {
      return;
    }

    const reported = await app.api.ok(
      api.threads.action,
      { params: { id: offer.id }, body: { type: 'reportSpam' } },
      token,
    );
    expect(reported.state).toBe('spam');
    expect(await listSubjects(ownerImap, 'Junk')).toEqual([OFFER]);
    expect(await listSubjects(ownerImap, 'INBOX')).toEqual(['Porada o 10']);
    const spam = await app.api.ok(api.threads.list, { query: { view: 'spam' } }, token);
    expect(spam.items.map((thread) => thread.id)).toEqual([offer.id]);
    const mailboxes = await app.api.ok(
      api.accounts.mailboxes,
      { params: { id: account.id } },
      token,
    );
    expect(mailboxes.find((mailbox) => mailbox.path === 'Junk')?.role).toBe('spam');

    const restored = await app.api.ok(
      api.threads.action,
      { params: { id: offer.id }, body: { type: 'notSpam' } },
      token,
    );
    expect(restored.state).toBe('inbox');
    expect(await listSubjects(ownerImap, 'Junk')).toEqual([]);
    expect(await listSubjects(ownerImap, 'INBOX')).toContain(OFFER);
    const emptied = await app.api.ok(api.threads.list, { query: { view: 'spam' } }, token);
    expect(emptied.items).toEqual([]);
  }, 60_000);
});
