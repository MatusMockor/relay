import { type Split, SplitIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { createTestStore, type TestStore } from './support/test-database';

const strictSplit: Split = {
  id: SplitIdSchema.parse('spl-klienti'),
  userId: LOCAL_USER_ID,
  accountId: null,
  name: 'Klienti',
  order: 0,
  match: 'all',
  rules: [
    { type: 'fromDomain', domain: 'klient.sk' },
    { type: 'recipient', field: 'cc', match: 'domain', value: 'firma.sk' },
  ],
  exceptions: [{ type: 'subjectContains', value: 'newsletter' }, { type: 'hasAttachment' }],
  exclusive: true,
  hideTasks: false,
};

describe('SqliteSplitRepository conditions', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('stores the match mode, exceptions and new condition types', async () => {
    await expect(
      store.repositories.splits.replaceAll(LOCAL_USER_ID, [strictSplit]),
    ).resolves.toEqual([strictSplit]);
    await expect(store.repositories.splits.listByUser(LOCAL_USER_ID)).resolves.toEqual([
      strictSplit,
    ]);
  });

  it('updates the match mode and exceptions of an existing split', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [strictSplit]);
    const relaxed: Split = { ...strictSplit, match: 'any', exceptions: [] };

    await expect(store.repositories.splits.replaceAll(LOCAL_USER_ID, [relaxed])).resolves.toEqual([
      relaxed,
    ]);
  });

  it('lists a split from a newer version apart and keeps it at a new position', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [strictSplit]);
    store.database.sqlite
      .prepare(
        `insert into splits (id, user_id, account_id, name, position, match, rules, exceptions, exclusive, hide_tasks)
         values ('spl-newer', ?, null, 'Preklady', 1, 'some', '[{"type":"language","value":"de"}]', '[]', 1, 0)`,
      )
      .run(LOCAL_USER_ID);
    const newer = {
      kind: 'unsupported',
      id: SplitIdSchema.parse('spl-newer'),
      accountId: null,
      name: 'Preklady',
      order: 1,
      exclusive: true,
      hideTasks: false,
    };

    expect(await store.repositories.splits.listByUser(LOCAL_USER_ID)).toEqual([strictSplit]);
    expect(await store.repositories.splits.listUnsupported(LOCAL_USER_ID)).toEqual([newer]);
    await store.repositories.splits.replaceAll(
      LOCAL_USER_ID,
      [{ ...strictSplit, order: 1 }],
      [{ id: newer.id, order: 0 }],
    );
    expect(await store.repositories.splits.listUnsupported(LOCAL_USER_ID)).toEqual([
      { ...newer, order: 0 },
    ]);
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [strictSplit]);
    expect(await store.repositories.splits.listUnsupported(LOCAL_USER_ID)).toEqual([]);
  });
});
