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
    const result = await client.query(
      `UPDATE messages AS m SET normalized_subject = v.normalized
       FROM unnest($1::text[], $2::text[], $3::text[]) AS v(id, subject, normalized)
       WHERE m.id = v.id AND m.subject = v.subject AND m.normalized_subject IS NULL`,
      [
        rows.map((row) => row.id),
        rows.map((row) => row.subject),
        rows.map((row) => normalizeSubject(row.subject).value),
      ],
    );
    updated += result.rowCount ?? 0;
  }
};
