import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { installStubClaude, type StubClaude } from '../support/stub-claude';
import { startTestApp, type TestApp } from '../support/test-app';

const PARTNER = 'partner@relay.test';

describe('sync now, subject threading and automatic one-liners', () => {
  let app: TestApp;
  let claude: StubClaude;
  let owner: GreenMailUser;
  let imap: ImapFlow;

  beforeAll(async () => {
    claude = await installStubClaude(JSON.stringify({ text: 'Partner posiela plán' }));
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', AI_CLI_PATH: claude.dir } });
    owner = await createGreenMailUser('sync');
    imap = await openImap(owner);
  });

  afterAll(async () => {
    await imap.logout();
    await app.close();
    await claude.dispose();
    await deleteGreenMailUser(owner);
  });

  it('syncs on request, threads replies by subject and fills one-liners on the server', async () => {
    const session = await registerUser(app.api, `sync-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await app.api.ok(api.settings.update, { body: { ai: { location: 'server' } } }, token);
    await imap.append(
      'INBOX',
      rawMail({ from: PARTNER, to: owner.email, subject: 'Plán na Q1', body: 'Návrh plánu' }),
    );
    const account = await addImapAccount(app.api, token, owner);
    const [first] = await waitForInbox(app.api, token, (threads) => threads.length === 1);

    await imap.append(
      'INBOX',
      rawMail({ from: PARTNER, to: owner.email, subject: 'RE: Plán na Q1', body: 'Doplnok' }),
    );
    await imap.append(
      'INBOX',
      rawMail({ from: PARTNER, to: owner.email, subject: 'Faktúra', body: 'Nová téma' }),
    );
    const accepted = await app.api.ok(api.sync.now, { body: {} }, token);
    expect(accepted).toEqual({ accepted: true });

    const threads = await waitForInbox(app.api, token, (items) => items.length === 2);
    const plan = threads.find((thread) => thread.subject === 'Plán na Q1');
    expect(plan).toMatchObject({ id: first?.id, messageCount: 2 });
    await expect
      .poll(
        async () =>
          (await app.api.ok(api.threads.list, { query: { view: 'inbox' } }, token)).items.map(
            (thread) => thread.aiOneLiner,
          ),
        { timeout: 20_000, interval: 250 },
      )
      .toEqual(['Partner posiela plán', 'Partner posiela plán']);

    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, token);
    expect(await app.api.ok(api.sync.now, {}, token)).toEqual({ accepted: true });
  });

  it('refuses to sync an account of another user', async () => {
    const owners = await registerUser(app.api, `sync-a-${randomUUID().slice(0, 8)}@relay.test`);
    const other = await registerUser(app.api, `sync-b-${randomUUID().slice(0, 8)}@relay.test`);
    const mailbox = await createGreenMailUser('sync-own');
    const account = await addImapAccount(app.api, owners.accessToken, mailbox);

    const failure = await app.api.fail(
      api.sync.now,
      { body: { accountId: account.id } },
      other.accessToken,
    );

    expect(failure).toMatchObject({ status: 404, error: { code: 'not_found' } });
    await deleteGreenMailUser(mailbox);
  });
});
