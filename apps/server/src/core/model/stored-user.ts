import type { User } from '@relay/shared/domain';

export interface StoredUser {
  readonly user: User;
  readonly passwordHash: string;
}
