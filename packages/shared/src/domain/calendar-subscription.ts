import { z } from 'zod';
import { CalendarSubscriptionIdSchema, UserIdSchema } from './ids';
import { HexColorSchema, IsoDateTimeSchema } from './primitives';

export const CalendarSubscriptionStatusSchema = z.enum(['pending', 'ok', 'error']);
export type CalendarSubscriptionStatus = z.infer<typeof CalendarSubscriptionStatusSchema>;

export const CalendarFeedUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((url) => !/[\s]/.test(url), 'The feed URL must not contain whitespace');

export const CalendarSubscriptionSchema = z.object({
  id: CalendarSubscriptionIdSchema,
  userId: UserIdSchema,
  name: z.string().min(1).max(120),
  color: HexColorSchema,
  host: z.string().max(255),
  status: CalendarSubscriptionStatusSchema,
  lastError: z.string().nullable(),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  eventCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CalendarSubscription = z.infer<typeof CalendarSubscriptionSchema>;
