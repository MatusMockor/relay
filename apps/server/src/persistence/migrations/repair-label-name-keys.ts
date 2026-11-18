import { repairedLabelNameKeys, type StoredLabelKey } from '@relay/shared/domain';
import type pg from 'pg';

const PARKED = '\u0002';

const hasNameKey = async (client: pg.Client): Promise<boolean> => {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'labels' AND column_name = 'name_key'`,
  );
  return rows.length > 0;
};

export const repairLabelNameKeys = async (client: pg.Client): Promise<number> => {
  if (!(await hasNameKey(client))) {
    return 0;
  }
  const { rows } = await client.query<StoredLabelKey>(
    'SELECT id, account_id AS "accountId", name, name_key AS "nameKey" FROM labels',
  );
  const changes = repairedLabelNameKeys(rows);
  if (changes.length === 0) {
    return 0;
  }
  const ids = changes.map((change) => change.id);
  await client.query('BEGIN');
  try {
    await client.query('UPDATE labels SET name_key = $2 || id WHERE id = ANY($1::text[])', [
      ids,
      PARKED,
    ]);
    await client.query(
      `UPDATE labels AS l SET name_key = v.name_key
       FROM unnest($1::text[], $2::text[]) AS v(id, name_key) WHERE l.id = v.id`,
      [ids, changes.map((change) => change.nameKey)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return changes.length;
};
