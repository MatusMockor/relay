import { z } from 'zod';
import { AddressSchema } from './address';
import {
  AccountIdSchema,
  CalendarEventIdSchema,
  CalendarSubscriptionIdSchema,
  GoogleCalendarIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from './ids';
import { HexColorSchema, IsoDateTimeSchema } from './primitives';

export const CalendarMethodSchema = z.enum(['REQUEST', 'CANCEL', 'REPLY', 'PUBLISH']);
export type CalendarMethod = z.infer<typeof CalendarMethodSchema>;

export const CalendarPartStatSchema = z.enum([
  'needs-action',
  'accepted',
  'tentative',
  'declined',
  'delegated',
]);
export type CalendarPartStat = z.infer<typeof CalendarPartStatSchema>;

export const CalendarRsvpResponseSchema = z.enum(['accepted', 'tentative', 'declined']);
export type CalendarRsvpResponse = z.infer<typeof CalendarRsvpResponseSchema>;

export const CalendarEventStatusSchema = z.enum(['confirmed', 'tentative', 'cancelled']);
export type CalendarEventStatus = z.infer<typeof CalendarEventStatusSchema>;

export const CalendarSourceKindSchema = z.enum(['invite', 'subscription', 'google']);
export type CalendarSourceKind = z.infer<typeof CalendarSourceKindSchema>;

export const CalendarAttendeeSchema = AddressSchema.extend({
  partstat: CalendarPartStatSchema,
  role: z.string().max(40).nullable(),
  repliedAt: IsoDateTimeSchema.nullable().optional(),
});
export type CalendarAttendee = z.infer<typeof CalendarAttendeeSchema>;

export const CalendarOccurrenceSchema = z.object({
  id: z.string().min(1).max(300),
  eventId: CalendarEventIdSchema,
  sourceKind: CalendarSourceKindSchema,
  accountId: AccountIdSchema.nullable(),
  subscriptionId: CalendarSubscriptionIdSchema.nullable(),
  googleCalendarId: GoogleCalendarIdSchema.nullable(),
  canDelete: z.boolean(),
  canRespond: z.boolean(),
  uid: z.string().min(1),
  recurrenceId: z.string().nullable(),
  title: z.string(),
  location: z.string().nullable(),
  start: IsoDateTimeSchema,
  end: IsoDateTimeSchema,
  allDay: z.boolean(),
  status: CalendarEventStatusSchema,
  myStatus: CalendarPartStatSchema.nullable(),
  organizer: AddressSchema.nullable(),
  threadId: ThreadIdSchema.nullable(),
  color: HexColorSchema,
});
export type CalendarOccurrence = z.infer<typeof CalendarOccurrenceSchema>;

export const CalendarConflictSchema = z.object({
  title: z.string(),
  start: IsoDateTimeSchema,
  end: IsoDateTimeSchema,
  allDay: z.boolean(),
});
export type CalendarConflict = z.infer<typeof CalendarConflictSchema>;

export const CalendarInvitationSchema = z.object({
  eventId: CalendarEventIdSchema,
  accountId: AccountIdSchema,
  messageId: MessageIdSchema.nullable(),
  threadId: ThreadIdSchema.nullable(),
  method: CalendarMethodSchema.nullable(),
  uid: z.string().min(1),
  title: z.string(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  organizer: AddressSchema.nullable(),
  attendees: z.array(CalendarAttendeeSchema),
  start: IsoDateTimeSchema,
  end: IsoDateTimeSchema,
  allDay: z.boolean(),
  recurring: z.boolean(),
  status: CalendarEventStatusSchema,
  myStatus: CalendarPartStatSchema.nullable(),
  canRespond: z.boolean(),
  conflicts: z.array(CalendarConflictSchema),
});
export type CalendarInvitation = z.infer<typeof CalendarInvitationSchema>;
