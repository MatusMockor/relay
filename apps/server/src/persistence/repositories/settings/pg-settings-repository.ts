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
}
