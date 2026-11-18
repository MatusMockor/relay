import { ConflictError } from '@relay/engine';
import type { AccountId, Label, LabelId } from '@relay/shared/domain';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { repairLabelNameKeys } from '../../src/persistence/migrations/repair-label-name-keys';
import { newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('label name key repair in Postgres', () => {
  const context = usePgTestContext();

  const withClient = async <Result>(work: (client: pg.Client) => Promise<Result>) => {
    const client = new pg.Client({ connectionString: context.url });
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  };

  const legacyLabels = async (accountId: AccountId, names: readonly [string, string, string][]) => {
    const labels: Label[] = [];
    for (const [id, name, nameKey] of names) {
      const label: Label = {
        id: id as LabelId,
        accountId,
        name: `seed-${id}`,
        color: null,
        kind: 'keyword',
        remoteName: `${id}-kw`,
      };
      await context.repositories.labels.upsert(label);
      await withClient((client) =>
        client.query('UPDATE labels SET name = $2, name_key = $3 WHERE id = $1', [
          id,
          name,
          nameKey,
        ]),
      );
      labels.push({ ...label, name });
    }
    return labels;
  };

  const keysOf = (accountId: AccountId) =>
    withClient(async (client) => {
      const { rows } = await client.query<{ id: string; name_key: string }>(
        'SELECT id, name_key FROM labels WHERE account_id = $1 ORDER BY id',
        [accountId],
      );
      return rows;
    });

  it('rewrites backfilled keys to runtime normalization with a collision-proof suffix', async () => {
    const seeded = await seedAccount(context.repositories);
    const prefix = newId('label');
    await legacyLabels(seeded.account.id, [
      [`${prefix}-a`, 'Clients', 'clients'],
      [`${prefix}-b`, 'clients', `clients#${prefix}-b`],
      [`${prefix}-c`, 'Účty', 'účty'],
      [`${prefix}-d`, 'ÚČTY', 'úČty'],
    ]);

    await withClient((client) => repairLabelNameKeys(client));

    expect(await keysOf(seeded.account.id)).toEqual([
      { id: `${prefix}-a`, name_key: 'clients' },
      { id: `${prefix}-b`, name_key: `clients\u0001${prefix}-b` },
      { id: `${prefix}-c`, name_key: 'účty' },
      { id: `${prefix}-d`, name_key: `účty\u0001${prefix}-d` },
    ]);
    await expect(withClient((client) => repairLabelNameKeys(client))).resolves.toBe(0);
  });

  it('keeps the stored key when a colliding label changes only its colour', async () => {
    const seeded = await seedAccount(context.repositories);
    const prefix = newId('label');
    const [, legacy] = await legacyLabels(seeded.account.id, [
      [`${prefix}-a`, 'Clients', 'clients'],
      [`${prefix}-b`, 'clients', `clients\u0001${prefix}-b`],
    ]);
    const label = legacy as Label;

    await context.repositories.labels.upsert({ ...label, color: '#ff0000' });
    await expect(
      context.repositories.labels.upsert({ ...label, name: 'CLIENTS' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await context.repositories.labels.upsert({ ...label, name: 'Zákazníci' });

    expect(await keysOf(seeded.account.id)).toEqual([
      { id: `${prefix}-a`, name_key: 'clients' },
      { id: `${prefix}-b`, name_key: 'zákazníci' },
    ]);
  });
});
