import type { AccountId, MailAccount } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const idsOf = (accounts: readonly MailAccount[]): AccountId[] =>
  accounts.map((account) => account.id);

describe('local account order through IPC (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailboxes: GreenMailAccount[];
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailboxes = await Promise.all([1, 2, 3].map(() => createGreenMailAccount()));
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await Promise.all(mailboxes.map((mailbox) => mailbox.remove()));
    await dir.remove();
  });

  const addAccounts = async (): Promise<AccountId[]> => {
    const created: AccountId[] = [];
    for (const mailbox of mailboxes) {
      const account = expectOk(
        await harness.bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
      );
      created.push(account.id);
    }
    return created;
  };

  it('stores the chosen order and lists the accounts in it', async () => {
    const created = await addAccounts();
    const order = [...created.slice(1), ...created.slice(0, 1)];
    harness.events.length = 0;

    const reordered = expectOk(
      await harness.bridge.invoke('local.accounts.reorder', { accountIds: order }),
    );

    expect(idsOf(reordered)).toEqual(order);
    expect(idsOf(expectOk(await harness.bridge.invoke('local.accounts.list')))).toEqual(order);
    await expect
      .poll(() =>
        harness.events.flatMap((event) =>
          event.type === 'accounts.reordered' ? [event.data.accountIds] : [],
        ),
      )
      .toEqual([order]);
  });

  it('rejects an order that is not exactly the local accounts', async () => {
    const created = await addAccounts();

    const missing = await harness.bridge.invoke('local.accounts.reorder', {
      accountIds: created.slice(1),
    });
    const duplicate = await harness.bridge.invoke('local.accounts.reorder', {
      accountIds: [...created, ...created.slice(0, 1)],
    });
    const malformed = await harness.bridge.invoke('local.accounts.reorder', {
      accountIds: [''],
    });

    for (const result of [missing, duplicate, malformed]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    }
    expect(idsOf(expectOk(await harness.bridge.invoke('local.accounts.list')))).toEqual(created);
  });
});
