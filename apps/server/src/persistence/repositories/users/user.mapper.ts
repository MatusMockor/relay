import type { User } from '@relay/shared/domain';
import type { StoredUser } from '../../../core/model/stored-user';
import type { users } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type UserRow = typeof users.$inferSelect;
type UserInsert = typeof users.$inferInsert;

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  createdAt: toIso(row.createdAt),
});

export const toStoredUser = (row: UserRow): StoredUser => ({
  user: toUser(row),
  passwordHash: row.passwordHash,
});

export const toUserInsert = (user: User, passwordHash: string): UserInsert => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  passwordHash,
  createdAt: toDate(user.createdAt),
});
