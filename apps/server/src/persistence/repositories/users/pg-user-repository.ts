import { ConflictError } from '@relay/engine';
import type { User, UserId } from '@relay/shared/domain';
import { eq, sql } from 'drizzle-orm';
import type { StoredUser } from '../../../core/model/stored-user';
import type { UserRepository } from '../../../core/ports/user-repository';
import type { DbExecutor } from '../../database/database';
import { users } from '../../schema';
import { isUniqueViolation } from '../../support/postgres-errors';
import { toStoredUser, toUser, toUserInsert } from './user.mapper';

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(user: User, passwordHash: string): Promise<User> {
    try {
      const [row] = await this.db
        .insert(users)
        .values(toUserInsert(user, passwordHash))
        .returning();
      if (row === undefined) {
        throw new ConflictError('User could not be created');
      }
      return toUser(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A user with this email already exists', { cause: error });
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    return row === undefined ? null : toStoredUser(row);
  }

  async findById(userId: UserId): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    return row === undefined ? null : toUser(row);
  }
}
