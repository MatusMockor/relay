import type { AutomationInput } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from './support/greenmail';
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

const INVOICE = { from: 'Faktúry <faktury@dodavatel.test>', text: 'V prílohe faktúra.' };

describe('local automation that moves mail into a folder (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let folderPath: string;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    folderPath = await withImap(mailbox, async (client) => {
      const created = await client.mailboxCreate(['Faktúry']);
      return created.path;
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  const setup = async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    await deliverMail(mailbox, { ...INVOICE, subject: 'Faktúra september' });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const mailboxes = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    const folder = required(mailboxes.find((candidate) => candidate.path === folderPath));
    const preset = required(expectOk(await bridge.invoke('local.automations.list'))[0]);
    const rule: AutomationInput = {
      accountId: account.id,
      name: 'Faktúry',
      enabled: true,
      order: 1,
      match: 'all',
      conditions: [{ type: 'fromDomain', domain: 'dodavatel.test' }],
      exceptions: [],
      ai: { runner: 'claude', model: null, effort: null, instructions: null },
      actions: [{ type: 'moveTo', mailboxId: folder.id }, { type: 'markRead' }],
    };
    const saved = expectOk(
      await bridge.invoke('local.automations.replace', { automations: [preset, rule] }),
    );
    return { account, folder, saved: required(saved.find((item) => item.name === 'Faktúry')) };
  };

  it('moves new matching mail into the folder of the rule', async () => {
    const { bridge } = harness;
    const { account, folder } = await setup();

    await deliverMail(mailbox, { ...INVOICE, subject: 'Faktúra október' });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    expect(await subjectsIn(mailbox, folderPath)).toEqual(['Faktúra október']);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual(['Faktúra september']);
    const listed = expectOk(
      await bridge.invoke('local.threads.list', { view: 'mailbox', mailboxId: folder.id }),
    );
    expect(listed.items.map((item) => [item.subject, item.state, item.unread])).toEqual([
      ['Faktúra október', 'done', false],
    ]);
  });

  it('applies the rule to mail that was already in the inbox once', async () => {
    const { bridge } = harness;
    const { saved } = await setup();

    const applied = expectOk(
      await bridge.invoke('local.automations.apply', { automationId: saved.id }),
    );
    const repeated = expectOk(
      await bridge.invoke('local.automations.apply', { automationId: saved.id }),
    );

    expect(applied).toEqual({ matched: 1, applied: 1, failed: 0 });
    expect(repeated).toEqual({ matched: 0, applied: 0, failed: 0 });
    expect(await subjectsIn(mailbox, folderPath)).toEqual(['Faktúra september']);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual([]);
  });
});
