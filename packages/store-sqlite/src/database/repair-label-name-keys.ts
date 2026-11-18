import { repairedLabelNameKeys } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { labels } from '../schema';
import type { SqliteDatabase } from './sqlite-database';

const PARKED = '\u0002';

const hasNameKey = (database: SqliteDatabase): boolean =>
  database.sqlite
    .prepare<[], { name: string }>("select name from pragma_table_info('labels')")
    .all()
    .some((column) => column.name === 'name_key');

export const repairLabelNameKeys = (database: SqliteDatabase): number => {
  if (!hasNameKey(database)) {
    return 0;
  }
  const rows = database.db
    .select({
      id: labels.id,
      accountId: labels.accountId,
      name: labels.name,
      nameKey: labels.nameKey,
    })
    .from(labels)
    .all();
  const changes = repairedLabelNameKeys(rows);
  if (changes.length === 0) {
    return 0;
  }
  database.sqlite.transaction(() => {
    changes.forEach(({ id }) => {
      database.db
        .update(labels)
        .set({ nameKey: `${PARKED}${id}` })
        .where(eq(labels.id, id))
        .run();
    });
    changes.forEach(({ id, nameKey }) => {
      database.db.update(labels).set({ nameKey }).where(eq(labels.id, id)).run();
    });
  })();
  return changes.length;
};
