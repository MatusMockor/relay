import type { GreenMailUser } from '@relay/config/test-infra';
import { api, type SplitPreviewBody } from '@relay/shared/api';
import { supportedAutomations, supportedSplits } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const CLIENT = 'jana@klient.test';
const NOREPLY = 'noreply@klient.test';

const invoices: SplitPreviewBody = {
  splitId: null,
  accountId: null,
  match: 'any',
  rules: [{ type: 'subjectContains', value: 'faktura' }],
  exceptions: [{ type: 'fromAddress', address: NOREPLY }],
};

describe('split preview over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let imap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('split-preview');
    imap = await openImap(owner);
    const mails = [
      { from: CLIENT, subject: 'Faktúra 1' },
      { from: 'peter@dodavatel.test', subject: 'Faktúra 2' },
      { from: NOREPLY, subject: 'Faktúra noreply' },
      { from: CLIENT, subject: 'Obed' },
    ];
    for (const mail of mails) {
      await imap.append('INBOX', rawMail({ ...mail, to: owner.email, body: 'Ahoj' }));
    }
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await imap.logout();
    await deleteGreenMailUser(owner);
  });

  it('counts recent threads and reports earlier splits and placing automations', async () => {
    const session = await registerUser(app.api, `preview-${owner.email}`);
    const token = session.accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 4);
    const [client] = supportedSplits(
      await app.api.ok(
        api.splits.replace,
        {
          body: {
            splits: [
              {
                accountId: null,
                name: 'Klient',
                order: 0,
                exclusive: true,
                hideTasks: false,
                rules: [{ type: 'fromAddress', address: CLIENT }],
              },
            ],
          },
        },
        token,
      ),
    );
    const current = supportedAutomations(await app.api.ok(api.automations.list, {}, token));
    await app.api.ok(
      api.automations.replace,
      {
        body: {
          automations: [
            ...current,
            {
              accountId: account.id,
              name: 'Archív dodávateľ',
              enabled: true,
              order: current.length,
              conditions: [{ type: 'fromDomain', domain: 'dodavatel.test' }],
              ai: { runner: 'claude', model: null, effort: null, instructions: null },
              actions: [{ type: 'archive' }],
            },
          ],
        },
      },
      token,
    );

    const preview = await app.api.ok(api.splits.preview, { body: invoices }, token);

    expect(preview).toMatchObject({ days: 30, count: 2, truncated: false });
    expect(preview.samples.map((sample) => sample.subject).sort()).toEqual([
      'Faktúra 1',
      'Faktúra 2',
    ]);
    expect(preview.overlaps.map((overlap) => [overlap.kind, overlap.name, overlap.count])).toEqual([
      ['split', 'Klient', 1],
      ['automation', 'Archív dodávateľ', 1],
    ]);
    expect(
      (
        await app.api.ok(
          api.splits.preview,
          { body: { ...invoices, splitId: client?.id ?? null } },
          token,
        )
      ).overlaps.map((overlap) => overlap.kind),
    ).toEqual(['automation']);
    expect(
      await app.api.fail(api.splits.preview, { body: { ...invoices, rules: [] } }, token),
    ).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
  });
});
