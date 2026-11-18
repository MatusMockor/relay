import { ConflictError } from '@relay/engine';
import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('case-insensitive label names in Postgres', () => {
  const context = usePgTestContext();

  it('rejects a second label whose name differs only in case and finds labels by any case', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories, seeded.user);
    const { labels } = context.repositories;
    const label: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Fakt&c3ba-ry',
    };
    await labels.upsert(label);

    await expect(
      labels.upsert({ ...label, id: newId('label'), name: 'FAKTÚRY', remoteName: 'x' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      labels.upsert({ ...label, id: newId('label'), accountId: other.account.id }),
    ).resolves.toMatchObject({ name: 'Faktúry' });
    expect((await labels.findByName(seeded.account.id, 'faktúry'))?.id).toBe(label.id);
  });
});
