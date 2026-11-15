import { z } from 'zod';
import { ReminderIdSchema, ThreadIdSchema, UserIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

export const ReminderSchema = z.object({
  id: ReminderIdSchema,
  userId: UserIdSchema,
  threadId: ThreadIdSchema,
  remindAt: IsoDateTimeSchema,
  firedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Reminder = z.infer<typeof ReminderSchema>;
