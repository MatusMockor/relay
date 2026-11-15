import { isDeepStrictEqual } from 'node:util';
import type { SettingsRepository } from '@relay/engine';
import { type UserId, type UserSettings, UserSettingsSchema } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { settings } from '../schema';

const read = (db: RelayDb, userId: UserId): UserSettings | null => {
  const row = db.select().from(settings).where(eq(settings.userId, userId)).get();
  return row === undefined ? null : UserSettingsSchema.parse(row.value);
};

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  find(userId: UserId): Promise<UserSettings | null> {
    return this.executor.execute((db) => read(db, userId));
  }

  save(userId: UserId, value: UserSettings): Promise<UserSettings> {
    return this.executor.execute((db) => {
      db.insert(settings)
        .values({ userId, value })
        .onConflictDoUpdate({ target: settings.userId, set: { value } })
        .run();
      return value;
    });
  }

  saveIfUnchanged(
    userId: UserId,
    expected: UserSettings | null,
    next: UserSettings,
  ): Promise<boolean> {
    return this.executor.execute((db) => {
      if (!isDeepStrictEqual(read(db, userId), expected)) {
        return false;
      }
      db.insert(settings)
        .values({ userId, value: next })
        .onConflictDoUpdate({ target: settings.userId, set: { value: next } })
        .run();
      return true;
    });
  }
}
