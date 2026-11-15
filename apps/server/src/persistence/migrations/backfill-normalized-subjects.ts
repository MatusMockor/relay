import { normalizeSubject } from '@relay/engine';
import type pg from 'pg';

const BATCH_SIZE = 500;

interface SubjectRow {
  readonly id: string;
  readonly subject: string;
}

const hasNormalizedSubject = async (client: pg.Client): Promise<boolean> => {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'messages'
       AND column_name = 'normalized_subject'`,
  );
  return rows.length > 0;
};

export const backfillNormalizedSubjects = async (client: pg.Client): Promise<number> => {
  if (!(await hasNormalizedSubject(client))) {
    return 0;
  }
  let updated = 0;
  for (;;) {
    const { rows } = await client.query<SubjectRow>(
      'SELECT id, subject FROM messages WHERE normalized_subject IS NULL ORDER BY id LIMIT $1',
      [BATCH_SIZE],
    );
    if (rows.length === 0) {
      return updated;
    }
    await client.query(
      `UPDATE messages AS m SET normalized_subject = v.normalized
       FROM unnest($1::text[], $2::text[]) AS v(id, normalized)
       WHERE m.id = v.id`,
      [rows.map((row) => row.id), rows.map((row) => normalizeSubject(row.subject).value)],
    );
    updated += rows.length;
  }
};
