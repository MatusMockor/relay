import { z } from 'zod';
import { AccountIdSchema, UserIdSchema } from '@relay/shared/domain';

export const SyncAccountJobSchema = z.object({
  userId: UserIdSchema,
  accountId: AccountIdSchema,
});
