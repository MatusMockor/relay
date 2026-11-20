import { supportedAutomations } from '@relay/shared';
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
    const preset = required(
      supportedAutomations(expectOk(await bridge.invoke('local.automations.list')))[0],
    );
    expect(preset).toMatchObject({ name: 'Jira tasky', preset: 'jiraTasks', enabled: false });
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    await deliverMail(mailbox, {
      from: 'Tibor <tibor@efabrica.test>',
      subject: 'Stará ponuka',
      text: 'Toto prišlo pred synchronizáciou.',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const saved = supportedAutomations(
      expectOk(
        await bridge.invoke('local.automations.replace', {
          automations: [
            { ...preset, enabled: true },
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
      ),
    );
    expect(saved.map((item) => [item.name, item.enabled])).toEqual([
      ['Jira tasky', true],
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

  it('previews a draft rule against synced mail without saving it', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    await deliverMail(mailbox, {
      from: 'Dodávateľ <fakturacia@dodavatel.test>',
      subject: 'FAKTÚRA 2026-11',
      text: 'V prílohe posielam faktúru.',
    });
    await deliverMail(mailbox, {
      from: 'Firma <noreply@firma.test>',
      subject: 'Faktúra pripravená',
      text: 'Automatická správa.',
    });
    await deliverMail(mailbox, {
      from: 'Tibor <tibor@efabrica.test>',
      subject: 'Obed',
      text: 'Ideme?',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const before = supportedAutomations(expectOk(await bridge.invoke('local.automations.list')));

    const preview = expectOk(
      await bridge.invoke('local.automations.preview', {
        accountId: account.id,
        match: 'all',
        conditions: [{ type: 'subjectContains', value: 'faktura' }],
        exceptions: [{ type: 'fromAddress', address: 'noreply@firma.test' }],
      }),
    );

    expect(preview).toMatchObject({
      days: 30,
      count: 1,
      samples: [{ subject: 'FAKTÚRA 2026-11', from: { email: 'fakturacia@dodavatel.test' } }],
    });
    expect(supportedAutomations(expectOk(await bridge.invoke('local.automations.list')))).toEqual(
      before,
    );
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

  it('removes the default Jira rule for good and restores it on request', async () => {
    const { bridge } = harness;
    supportedAutomations(expectOk(await bridge.invoke('local.automations.list')));

    expect(
      supportedAutomations(
        expectOk(await bridge.invoke('local.automations.replace', { automations: [] })),
      ),
    ).toEqual([]);
    expect(supportedAutomations(expectOk(await bridge.invoke('local.automations.list')))).toEqual(
      [],
    );
    const restored = supportedAutomations(
      expectOk(await bridge.invoke('local.automations.restoreDefault')),
    );

    expect(restored).toEqual([
      expect.objectContaining({ name: 'Jira tasky', preset: 'jiraTasks', enabled: false }),
    ]);
    expect(supportedAutomations(expectOk(await bridge.invoke('local.automations.list')))).toEqual(
      restored,
    );
  });
});
