import { isDeepStrictEqual } from 'node:util';
import type { SettingsRepository } from '@relay/engine';
import { type UserId, type UserSettings, UserSettingsSchema } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { userSettings } from '../../schema';

export class PgSettingsRepository implements SettingsRepository {
  constructor(private readonly db: DbExecutor) {}

  async find(userId: UserId): Promise<UserSettings | null> {
    const [row] = await this.db
      .select({ settings: userSettings.settings })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    if (row === undefined) {
      return null;
    }
    const parsed = UserSettingsSchema.safeParse(row.settings);
    return parsed.success ? parsed.data : null;
  }

  async save(userId: UserId, settings: UserSettings): Promise<UserSettings> {
    const now = new Date();
    await this.db
      .insert(userSettings)
      .values({ userId, settings, updatedAt: now })
      .onConflictDoUpdate({ target: userSettings.userId, set: { settings, updatedAt: now } });
    return settings;
  }

  async saveIfUnchanged(
    userId: UserId,
    expected: UserSettings | null,
    next: UserSettings,
  ): Promise<boolean> {
    const now = new Date();
    if (expected === null) {
      const rows = await this.db
        .insert(userSettings)
        .values({ userId, settings: next, updatedAt: now })
        .onConflictDoNothing({ target: userSettings.userId })
        .returning({ userId: userSettings.userId });
      return rows.length > 0;
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ settings: userSettings.settings })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .for('update');
      const stored = row === undefined ? null : UserSettingsSchema.safeParse(row.settings);
      if (stored?.success !== true || !isDeepStrictEqual(stored.data, expected)) {
        return false;
      }
      await tx
        .update(userSettings)
        .set({ settings: next, updatedAt: now })
        .where(eq(userSettings.userId, userId));
      return true;
    });
  }
}
