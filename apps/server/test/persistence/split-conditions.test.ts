import type { Split, UserId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { toSplitInsert } from '../../src/persistence/repositories/splits/split.mapper';
import { splits } from '../../src/persistence/schema';
import { newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const strictSplit = (userId: UserId): Split => ({
  id: newId('split'),
  userId,
  accountId: null,
  name: 'Klienti',
  order: 0,
  match: 'all',
  rules: [
    { type: 'fromDomain', domain: 'klient.test' },
    { type: 'recipient', field: 'cc', match: 'domain', value: 'firma.test' },
  ],
  exceptions: [{ type: 'subjectContains', value: 'newsletter' }, { type: 'hasAttachment' }],
  exclusive: true,
  hideTasks: false,
});

describe('PgSplitRepository conditions', () => {
  const context = usePgTestContext();

  it('stores the match mode, exceptions and new condition types', async () => {
    const { user } = await seedAccount(context.repositories);
    const split = strictSplit(user.id);

    await expect(context.repositories.splits.replaceAll(user.id, [split])).resolves.toEqual([
      split,
    ]);
    await expect(context.repositories.splits.listByUser(user.id)).resolves.toEqual([split]);
  });

  it('updates the match mode and exceptions of an existing split', async () => {
    const { user } = await seedAccount(context.repositories);
    const split = strictSplit(user.id);
    await context.repositories.splits.replaceAll(user.id, [split]);
    const relaxed: Split = { ...split, match: 'any', exceptions: [] };

    await expect(context.repositories.splits.replaceAll(user.id, [relaxed])).resolves.toEqual([
      relaxed,
    ]);
  });

  it('lists a split from a newer version apart and keeps it at a new position', async () => {
    const { user } = await seedAccount(context.repositories);
    const split = strictSplit(user.id);
    await context.repositories.splits.replaceAll(user.id, [split]);
    const newer = { ...strictSplit(user.id), name: 'Preklady', order: 1 };
    await context.db.insert(splits).values({
      ...toSplitInsert(newer),
      rules: sql`'[{"type":"language","value":"de"}]'::jsonb`,
    });

    expect(await context.repositories.splits.listByUser(user.id)).toEqual([split]);
    await context.repositories.splits.replaceAll(
      user.id,
      [{ ...split, order: 1 }],
      [{ id: newer.id, order: 0 }],
    );

    await expect(context.repositories.splits.listUnsupported(user.id)).resolves.toEqual([
      {
        kind: 'unsupported',
        id: newer.id,
        accountId: null,
        name: 'Preklady',
        order: 0,
        exclusive: true,
        hideTasks: false,
      },
    ]);
    await expect(context.repositories.splits.listByUser(user.id)).resolves.toEqual([
      { ...split, order: 1 },
    ]);
    await context.repositories.splits.replaceAll(user.id, []);
    await expect(context.repositories.splits.listByUser(user.id)).resolves.toEqual([]);
    await expect(context.repositories.splits.listUnsupported(user.id)).resolves.toHaveLength(1);
  });
});
