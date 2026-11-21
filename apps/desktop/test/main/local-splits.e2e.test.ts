import { supportedSplits } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local splits through IPC (SQLite + GreenMail)', () => {
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

  it('stores split conditions and previews a draft split with overlaps', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    await deliverMail(mailbox, {
      from: 'Jana <jana@klient.test>',
      subject: 'Faktúra 11',
      text: 'Posielam faktúru.',
    });
    await deliverMail(mailbox, {
      from: 'Klient <noreply@klient.test>',
      subject: 'Faktúra automatická',
      text: 'Automatická správa.',
    });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const saved = supportedSplits(
      expectOk(
        await bridge.invoke('local.splits.replace', {
          splits: [
            {
              accountId: null,
              name: 'Klient',
              order: 0,
              match: 'all',
              rules: [
                { type: 'fromDomain', domain: 'klient.test' },
                { type: 'subjectContains', value: 'faktura' },
              ],
              exceptions: [{ type: 'fromAddress', address: 'noreply@klient.test' }],
              exclusive: true,
              hideTasks: false,
            },
          ],
        }),
      ),
    );
    expect(saved).toMatchObject([
      { name: 'Klient', match: 'all', exceptions: [{ type: 'fromAddress' }] },
    ]);

    const preview = expectOk(
      await bridge.invoke('local.splits.preview', {
        splitId: null,
        accountId: account.id,
        match: 'any',
        rules: [{ type: 'subjectContains', value: 'faktúra' }],
        exceptions: [],
      }),
    );

    expect(preview).toMatchObject({ days: 30, count: 2, truncated: false });
    expect(preview.overlaps).toEqual([
      { kind: 'split', id: saved[0]?.id, name: 'Klient', count: 1 },
    ]);
    expect(expectOk(await bridge.invoke('local.splits.list'))).toEqual(saved);
  });
});
