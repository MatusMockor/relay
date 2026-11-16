import { z } from 'zod';
import {
  AccountIdSchema,
  CalendarConnectionIdSchema,
  GoogleCalendarIdSchema,
  UserIdSchema,
} from './ids';
import { EmailAddressSchema, HexColorSchema, IsoDateTimeSchema } from './primitives';

export const GoogleCalendarSyncStatusSchema = z.enum(['pending', 'ok', 'error']);
export type GoogleCalendarSyncStatus = z.infer<typeof GoogleCalendarSyncStatusSchema>;

export const CalendarConnectionStatusSchema = z.enum(['pending', 'ok', 'error', 'reauthorize']);
export type CalendarConnectionStatus = z.infer<typeof CalendarConnectionStatusSchema>;

export const GoogleCalendarAccessRoleSchema = z.enum([
  'freeBusyReader',
  'reader',
  'writer',
  'owner',
]);
export type GoogleCalendarAccessRole = z.infer<typeof GoogleCalendarAccessRoleSchema>;

export const GoogleCalendarSchema = z.object({
  id: GoogleCalendarIdSchema,
  connectionId: CalendarConnectionIdSchema,
  name: z.string().max(255),
  color: HexColorSchema,
  enabled: z.boolean(),
  primary: z.boolean(),
  accessRole: GoogleCalendarAccessRoleSchema,
  timeZone: z.string().max(64).nullable(),
  status: GoogleCalendarSyncStatusSchema,
  lastError: z.string().nullable(),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
});
export type GoogleCalendar = z.infer<typeof GoogleCalendarSchema>;

export const GoogleCalendarConnectionSchema = z.object({
  id: CalendarConnectionIdSchema,
  userId: UserIdSchema,
  email: EmailAddressSchema,
  accountId: AccountIdSchema.nullable(),
  status: CalendarConnectionStatusSchema,
  lastError: z.string().nullable(),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  calendars: z.array(GoogleCalendarSchema),
});
export type GoogleCalendarConnection = z.infer<typeof GoogleCalendarConnectionSchema>;

export const GoogleCalendarOverviewSchema = z.object({
  configured: z.boolean(),
  setupHint: z.string().nullable(),
  connections: z.array(GoogleCalendarConnectionSchema),
});
export type GoogleCalendarOverview = z.infer<typeof GoogleCalendarOverviewSchema>;

export const isWritableAccessRole = (role: GoogleCalendarAccessRole): boolean =>
  role === 'owner' || role === 'writer';
