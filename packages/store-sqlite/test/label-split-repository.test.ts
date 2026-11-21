import { ConflictError } from '@relay/engine';
import { LabelIdSchema, type Split, SplitIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, buildThread, threadId, userId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);
const splitId = (value: string) => SplitIdSchema.parse(value);

const buildSplit = (overrides: Partial<Split> = {}): Split => ({
  id: splitId('spl-1'),
  userId: LOCAL_USER_ID,
  accountId: null,
  name: 'Jira',
  order: 0,
  match: 'any',
  exceptions: [],
  rules: [{ type: 'jira', projectKeys: ['REL'] }],
  exclusive: true,
  hideTasks: false,
  ...overrides,
});

describe('SqliteLabelRepository', () => {
  let store: TestStore;
  let work: SeededAccount;
  let personal: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    personal = await seedAccount(store.repositories, {
      id: accountId('acc-2'),
      email: 'jan@osobne.sk',
    });
  });

  afterEach(() => {
    store.database.close();
  });

  it('upserts and lists labels per user and account', async () => {
    const { labels } = store.repositories;
    await labels.upsert({
      id: labelId('l-b'),
      accountId: work.account.id,
      name: 'Účty',
      color: null,
      kind: 'keyword',
      remoteName: 'Účty',
    });
    await labels.upsert({
      id: labelId('l-a'),
      accountId: personal.account.id,
      name: 'Rodina',
      color: '#00ff00',
      kind: 'keyword',
      remoteName: 'Rodina',
    });
    await labels.upsert({
      id: labelId('l-b'),
      accountId: work.account.id,
      name: 'Faktúry',
      color: '#ff0000',
      kind: 'keyword',
      remoteName: 'Faktúry',
    });

    expect((await labels.list(LOCAL_USER_ID, null)).map((label) => label.name)).toEqual([
      'Faktúry',
      'Rodina',
    ]);
    expect(await labels.list(LOCAL_USER_ID, work.account.id)).toEqual([
      {
        id: 'l-b',
        accountId: work.account.id,
        name: 'Faktúry',
        color: '#ff0000',
        kind: 'keyword',
        remoteName: 'Faktúry',
      },
    ]);
    expect(await labels.list(userId('intruder'), null)).toEqual([]);
    expect((await labels.findByName(work.account.id, 'Faktúry'))?.id).toBe('l-b');
    expect(await labels.findById(userId('intruder'), labelId('l-b'))).toBeNull();
  });

  it('rejects duplicate names within an account', async () => {
    const { labels } = store.repositories;
    await labels.upsert({
      id: labelId('l-1'),
      accountId: work.account.id,
      name: 'X',
      color: null,
      kind: 'keyword',
      remoteName: 'X',
    });
    await expect(
      labels.upsert({
        id: labelId('l-2'),
        accountId: work.account.id,
        name: 'X',
        color: null,
        kind: 'keyword',
        remoteName: 'X',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('deletes a label and strips it from threads', async () => {
    const { labels, threads } = store.repositories;
    await labels.upsert({
      id: labelId('l-1'),
      accountId: work.account.id,
      name: 'X',
      color: null,
      kind: 'keyword',
      remoteName: 'X',
    });
    await threads.upsert(buildThread({ labelIds: [labelId('l-1'), labelId('l-2')] }));

    expect(await labels.delete(userId('intruder'), labelId('l-1'))).toBe(false);
    expect(await labels.delete(LOCAL_USER_ID, labelId('l-1'))).toBe(true);
    expect(await labels.delete(LOCAL_USER_ID, labelId('l-1'))).toBe(false);
    expect((await threads.findById(LOCAL_USER_ID, threadId('thr-1')))?.labelIds).toEqual(['l-2']);
  });
});

describe('SqliteSplitRepository', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('replaces all splits keeping order and account scope', async () => {
    const { splits } = store.repositories;
    const unified = buildSplit({ id: splitId('spl-unified'), order: 1 });
    const scoped = buildSplit({
      id: splitId('spl-work'),
      accountId: work.account.id,
      name: 'Klienti',
      order: 0,
      exclusive: false,
      hideTasks: false,
      rules: [{ type: 'fromDomain', domain: 'klient.sk' }],
    });

    expect(await splits.replaceAll(LOCAL_USER_ID, [unified, scoped])).toEqual([scoped, unified]);
    expect(await splits.listForAccount(LOCAL_USER_ID, work.account.id)).toEqual([scoped, unified]);
    expect(await splits.listForAccount(LOCAL_USER_ID, accountId('acc-other'))).toEqual([unified]);
    expect(await splits.listByUser(userId('intruder'))).toEqual([]);
  });

  it('removes dropped splits and their thread memberships', async () => {
    const { splits, threads } = store.repositories;
    await splits.replaceAll(LOCAL_USER_ID, [
      buildSplit({ id: splitId('spl-a') }),
      buildSplit({ id: splitId('spl-b'), order: 1 }),
    ]);
    await threads.upsert(buildThread({ splitIds: [splitId('spl-a'), splitId('spl-b')] }));

    const kept = await splits.replaceAll(LOCAL_USER_ID, [
      buildSplit({ id: splitId('spl-b'), name: 'Renamed', order: 0 }),
    ]);

    expect(kept.map((split) => [split.id, split.name])).toEqual([['spl-b', 'Renamed']]);
    expect((await threads.findById(LOCAL_USER_ID, threadId('thr-1')))?.splitIds).toEqual(['spl-b']);
    expect(await splits.replaceAll(LOCAL_USER_ID, [])).toEqual([]);
  });
});
