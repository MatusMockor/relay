import { SplitIdSchema, supportedSplits, type UnsupportedSplit } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { threadBySubject } from '../support/automation-filters';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const NEWER: UnsupportedSplit = {
  kind: 'unsupported',
  id: SplitIdSchema.parse('split_newer'),
  accountId: null,
  name: 'Preklady',
  order: 0,
  exclusive: true,
  hideTasks: false,
};

const clients = {
  accountId: null,
  name: 'Klienti',
  order: 0,
  rules: [{ type: 'fromDomain' as const, domain: 'klient.test' }],
  exclusive: true,
  hideTasks: false,
};

const setup = async () => {
  const engine = createTestEngine();
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', {
    id: 'n1',
    from: { name: 'Klient', email: 'jana@klient.test' },
    subject: 'Übersetzung',
  });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = threadBySubject(engine, 'Übersetzung');
  engine.db.tables.threads.set(thread.id, { ...thread, splitIds: [NEWER.id] });
  engine.db.tables.unsupportedSplits.set(USER_ID, [NEWER]);
  return { engine, account, thread };
};

describe('splits from a newer Relay version', () => {
  it('lists them, keeps them on replace with their threads and keeps their tab working', async () => {
    const { engine, account, thread } = await setup();
    const { splits } = engine.services;

    expect(await splits.list(USER_ID)).toEqual([NEWER]);
    const replaced = await splits.replace(USER_ID, {
      splits: [clients, { id: NEWER.id, keep: true }],
    });

    expect(replaced.map((entry) => entry.id)).toEqual([supportedSplits(replaced)[0]?.id, NEWER.id]);
    expect(replaced.at(-1)).toEqual({ ...NEWER, order: 1 });
    expect(engine.events.ofType('splits.updated').at(-1)?.data.splits).toEqual(replaced);
    expect([...threadBySubject(engine, 'Übersetzung').splitIds].sort()).toEqual(
      [NEWER.id, supportedSplits(replaced)[0]?.id].sort(),
    );
    const tab = await engine.services.inbox.list(USER_ID, {
      view: 'inbox',
      accountId: account.id,
      splitId: NEWER.id,
      limit: 50,
    });
    expect(tab.items.map((item) => item.id)).toEqual([thread.id]);
  });

  it('refuses to keep an unknown split and keeps a newer split a stale client omitted', async () => {
    const { engine } = await setup();
    const { splits } = engine.services;

    await expect(
      splits.replace(USER_ID, {
        splits: [{ id: SplitIdSchema.parse('split_unknown'), keep: true }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      splits.replace(USER_ID, {
        splits: Array.from({ length: 50 }, (_, order) => ({ ...clients, order })),
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    const replaced = await splits.replace(USER_ID, { splits: [clients] });

    expect(replaced.at(-1)).toEqual({ ...NEWER, order: 1 });
    expect([...threadBySubject(engine, 'Übersetzung').splitIds]).toContain(NEWER.id);
  });
});
