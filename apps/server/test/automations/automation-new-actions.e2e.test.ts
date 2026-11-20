import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import { type Automation, supportedAutomations } from '@relay/shared/domain';
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
import { addImapAccount, listInbox, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const DAY_MS = 24 * 60 * 60_000;
const SENDER = 'uctaren@faktury.test';

const required = <Value>(value: Value | undefined): Value => {
  expect(value).toBeDefined();
  return value as Value;
};

describe('forward and remind automation actions over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let accountant: GreenMailUser;
  let ownerImap: ImapFlow;
  let accountantImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('rule-actions');
    accountant = await createGreenMailUser('rule-accountant');
    ownerImap = await openImap(owner);
    accountantImap = await openImap(accountant);
    await ownerImap.append(
      'INBOX',
      rawMail({ from: 'kolega@relay.test', to: owner.email, subject: 'Úvod', body: 'Ahoj' }),
    );
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([ownerImap.logout(), accountantImap.logout()]);
    await Promise.all([deleteGreenMailUser(owner), deleteGreenMailUser(accountant)]);
  });

  it('forwards a new invoice, snoozes it and undoes only the reminder', async () => {
    const session = await registerUser(app.api, `actions-${owner.email}`);
    const token = session.accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 1);
    await expect
      .poll(
        async () =>
          (await app.api.ok(api.accounts.list, {}, token)).find((item) => item.id === account.id)
            ?.lastSyncedAt ?? null,
        { timeout: 20_000, interval: 250 },
      )
      .not.toBeNull();
    const current = supportedAutomations(await app.api.ok(api.automations.list, {}, token));
    const rule = {
      accountId: account.id,
      name: 'Faktúry účtovníčke',
      enabled: true,
      order: current.length,
      conditions: [{ type: 'fromAddress' as const, address: SENDER }],
      ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
      actions: [
        { type: 'remind' as const, afterDays: 2 },
        { type: 'forward' as const, to: accountant.email },
      ],
    };
    const allAccounts = await app.api.fail(
      api.automations.replace,
      { body: { automations: [...current, { ...rule, accountId: null }] } },
      token,
    );
    expect(allAccounts).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    const saved = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        { body: { automations: [...current, rule] } },
        token,
      ),
    );
    const { id } = required(saved.find((item: Automation) => item.name === rule.name));

    await ownerImap.append(
      'INBOX',
      rawMail({ from: SENDER, to: owner.email, subject: 'Faktúra 9', body: 'Faktúra v prílohe' }),
    );
    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, token);

    await expect
      .poll(
        async () =>
          (await app.api.ok(api.automationHistory.history, { params: { id } }, token)).entries
            .length,
        { timeout: 20_000, interval: 250 },
      )
      .toBe(1);
    expect(await listSubjects(accountantImap, 'INBOX')).toEqual(['Fwd: Faktúra 9']);
    const reminders = await app.api.ok(api.threads.list, { query: { view: 'reminders' } }, token);
    const snoozed = required(reminders.items[0]);
    expect(snoozed).toMatchObject({ subject: 'Faktúra 9', state: 'reminder' });
    expect(Date.parse(snoozed.remindAt ?? '') - Date.now()).toBeGreaterThan(DAY_MS);
    expect((await listInbox(app.api, token)).items.map((thread) => thread.subject)).toEqual([
      'Úvod',
    ]);
    const history = await app.api.ok(api.automationHistory.history, { params: { id } }, token);
    const entry = required(history.entries[0]);
    expect(entry).toMatchObject({ source: 'live', threadId: snoozed.id });
    expect(entry.actions).toMatchObject([
      { action: { type: 'forward', to: accountant.email }, outcome: 'ok' },
      {
        action: { type: 'remind', afterDays: 2 },
        outcome: 'ok',
        reminder: { remindAt: snoozed.remindAt },
      },
    ]);

    const undone = await app.api.ok(
      api.automationHistory.undoEntry,
      { params: { id, entryId: entry.id } },
      token,
    );

    expect(undone.results).toEqual([
      { action: { type: 'forward', to: accountant.email }, outcome: 'notUndoable' },
      { action: { type: 'remind', afterDays: 2 }, outcome: 'undone' },
    ]);
    await waitForInbox(app.api, token, (items) => items.length === 2);
    expect(await app.api.ok(api.compose.listDrafts, {}, token)).toEqual([]);
  }, 60_000);
});
