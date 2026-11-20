import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const required = <T>(value: T | undefined): T => {
  expect(value).toBeDefined();
  return value as T;
};

describe('local automation history through IPC (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('records a live run and undoes it back into the inbox', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const current = expectOk(await bridge.invoke('local.automations.list'));
    const saved = expectOk(
      await bridge.invoke('local.automations.replace', {
        automations: [
          ...current,
          {
            accountId: account.id,
            name: 'Faktúry',
            enabled: true,
            order: current.length,
            conditions: [{ type: 'fromDomain', domain: 'dodavatel.test' }],
            ai: { runner: 'claude', model: null, effort: null, instructions: null },
            actions: [{ type: 'archive' }, { type: 'markRead' }],
          },
        ],
      }),
    );
    const { id: automationId } = required(saved.find((rule) => rule.name === 'Faktúry'));
    await deliverMail(mailbox, {
      from: 'Dodávateľ <fakturacia@dodavatel.test>',
      subject: 'Faktúra 2026-11',
      text: 'V prílohe posielam faktúru.',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    expect(expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' })).items).toEqual(
      [],
    );

    const history = expectOk(await bridge.invoke('local.automations.history', { automationId }));
    expect(history.stats).toMatchObject({ runs: 1, failedActions: 0 });
    const entry = required(history.entries[0]);
    expect(entry).toMatchObject({ source: 'live', subject: 'Faktúra 2026-11', undoneAt: null });

    const undone = expectOk(
      await bridge.invoke('local.automations.undoActivity', { automationId, activityId: entry.id }),
    );

    expect(undone.results.map((result) => result.outcome)).toEqual(['undone', 'undone']);
    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' })).items;
    expect(inbox.map((thread) => [thread.subject, thread.unread])).toEqual([
      ['Faktúra 2026-11', true],
    ]);
    expect(
      expectOk(
        await bridge.invoke('local.automations.undoSince', {
          automationId,
          since: '2000-01-01T00:00:00.000Z',
        }),
      ),
    ).toEqual({ entries: 0, undone: 0, failed: 0 });
  });
});
