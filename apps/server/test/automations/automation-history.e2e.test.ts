import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, listInbox, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const SUBJECTS = ['Faktúra 1', 'Faktúra 2'];

const required = <Value>(value: Value | undefined): Value => {
  expect(value).toBeDefined();
  return value as Value;
};

describe('automation history over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('history');
    ownerImap = await openImap(owner);
    for (const subject of SUBJECTS) {
      await ownerImap.append(
        'INBOX',
        rawMail({ from: 'uctaren@faktury.test', to: owner.email, subject, body: 'Ahoj' }),
      );
    }
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  it('lists the runs of a rule and undoes one run and the rest of the day', async () => {
    const session = await registerUser(app.api, `history-${owner.email}`);
    const other = await registerUser(app.api, `history-other-${owner.email}`);
    const token = session.accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 2);
    const current = await app.api.ok(api.automations.list, {}, token);
    const saved = await app.api.ok(
      api.automations.replace,
      {
        body: {
          automations: [
            ...current,
            {
              accountId: account.id,
              name: 'Faktúry',
              enabled: true,
              order: current.length,
              conditions: [{ type: 'fromDomain', domain: 'faktury.test' }],
              ai: { runner: 'claude', model: null, effort: null, instructions: null },
              actions: [{ type: 'archive' }, { type: 'markRead' }, { type: 'notify' }],
            },
          ],
        },
      },
      token,
    );
    const { id } = required(saved.find((automation) => automation.name === 'Faktúry'));
    await app.api.ok(api.automations.apply, { params: { id } }, token);
    expect((await listInbox(app.api, token)).items).toEqual([]);

    const history = await app.api.ok(api.automationHistory.history, { params: { id } }, token);
    expect(history.stats).toMatchObject({ days: 30, runs: 2, failedActions: 0 });
    expect(history.entries.map((entry) => entry.source)).toEqual(['apply', 'apply']);
    const first = required(history.entries[0]);

    const undone = await app.api.ok(
      api.automationHistory.undoEntry,
      { params: { id, entryId: first.id } },
      token,
    );
    expect(undone.results).toEqual([
      { action: { type: 'markRead' }, outcome: 'undone' },
      { action: { type: 'archive' }, outcome: 'undone' },
    ]);
    expect((await listInbox(app.api, token)).items.map((thread) => thread.id)).toEqual([
      first.threadId,
    ]);

    const rest = await app.api.ok(
      api.automationHistory.undoSince,
      { params: { id }, body: { since: '2000-01-01T00:00:00+01:00' } },
      token,
    );
    expect(rest).toEqual({ entries: 1, undone: 1, failed: 0 });
    expect((await listInbox(app.api, token)).items).toHaveLength(2);

    const foreign = await app.api.fail(
      api.automationHistory.history,
      { params: { id } },
      other.accessToken,
    );
    expect(foreign).toMatchObject({ status: 404, error: { code: 'not_found' } });
    const unknown = await app.api.fail(
      api.automationHistory.undoEntry,
      { params: { id, entryId: 'aua_unknown' } },
      token,
    );
    expect(unknown).toMatchObject({ status: 404, error: { code: 'not_found' } });
  }, 60_000);
});
