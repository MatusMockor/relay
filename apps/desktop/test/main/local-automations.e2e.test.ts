import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local automations through IPC (SQLite + GreenMail)', () => {
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

  it('seeds the Jira rule, stores new rules and runs them on new mail only', async () => {
    const { bridge } = harness;
    const [preset] = expectOk(await bridge.invoke('local.automations.list'));
    expect(preset).toMatchObject({ name: 'Jira tasky', preset: 'jiraTasks', enabled: true });
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    await deliverMail(mailbox, {
      from: 'Tibor <tibor@efabrica.test>',
      subject: 'Stará ponuka',
      text: 'Toto prišlo pred synchronizáciou.',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const saved = expectOk(
      await bridge.invoke('local.automations.replace', {
        automations: [
          { ...preset, enabled: false },
          {
            accountId: account.id,
            name: 'Od Tibora',
            enabled: true,
            order: 1,
            conditions: [{ type: 'fromDomain', domain: 'efabrica.test' }],
            ai: { runner: 'codex', model: 'gpt-6-luna', effort: 'low', instructions: null },
            actions: ['notify', 'markRead'],
          },
        ],
      }),
    );
    expect(saved.map((item) => [item.name, item.enabled])).toEqual([
      ['Jira tasky', false],
      ['Od Tibora', true],
    ]);
    expect(harness.events.map((event) => event.type)).toContain('automations.updated');

    await deliverMail(mailbox, {
      from: 'Tibor <tibor@efabrica.test>',
      subject: 'Nová ponuka',
      text: 'Pošli mi prosím cenu.',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const notified = harness.events.flatMap((event) =>
      event.type === 'automation.notified' ? [event.data.body] : [],
    );
    expect(notified).toEqual(['Nová ponuka']);
    const page = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(page.items.map((thread) => [thread.subject, thread.unread]).sort()).toEqual([
      ['Nová ponuka', false],
      ['Stará ponuka', true],
    ]);
  });

  it('rejects a rule with a model that is not in the catalog', async () => {
    const result = await harness.bridge.invoke('local.automations.replace', {
      automations: [
        {
          accountId: null,
          name: 'Zlý model',
          enabled: true,
          order: 0,
          conditions: [{ type: 'jiraEvent', kind: 'mention' }],
          ai: { runner: 'claude', model: 'gpt-6-luna', effort: null, instructions: null },
          actions: ['summary'],
        },
      ],
    });

    expect(result).toMatchObject({ ok: false });
  });
});
