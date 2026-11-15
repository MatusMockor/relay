import { z } from 'zod';
import { UserIdSchema } from './ids';
import { EmailAddressSchema, IsoDateTimeSchema } from './primitives';

export const UserSchema = z.object({
  id: UserIdSchema,
  email: EmailAddressSchema,
  displayName: z.string().min(1).max(200),
  createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;
