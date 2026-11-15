import type { User, UserId } from '@relay/shared/domain';
import type { StoredUser } from '../model/stored-user';

export interface UserRepository {
  create(user: User, passwordHash: string): Promise<User>;
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(userId: UserId): Promise<User | null>;
}
