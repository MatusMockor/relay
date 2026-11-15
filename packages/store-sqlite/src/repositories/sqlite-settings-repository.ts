import type { SettingsRepository } from '@relay/engine';
import { type UserId, type UserSettings, UserSettingsSchema } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { settings } from '../schema';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  find(userId: UserId): Promise<UserSettings | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(settings).where(eq(settings.userId, userId)).get();
      return row === undefined ? null : UserSettingsSchema.parse(row.value);
    });
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
}
