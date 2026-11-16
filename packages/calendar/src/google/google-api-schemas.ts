import { z } from 'zod';

const text = (max: number) => z.string().max(max);

export const GoogleEventDateTimeSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTime: z.iso.datetime({ offset: true }).optional(),
  timeZone: text(64).optional(),
});
export type GoogleEventDateTime = z.infer<typeof GoogleEventDateTimeSchema>;

const PersonSchema = z.object({
  email: text(320).optional(),
  displayName: text(500).optional(),
  self: z.boolean().optional(),
});

export const GoogleAttendeeSchema = z.looseObject({
  ...PersonSchema.shape,
  organizer: z.boolean().optional(),
  resource: z.boolean().optional(),
  optional: z.boolean().optional(),
  responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted']).optional(),
});
export type GoogleAttendee = z.infer<typeof GoogleAttendeeSchema>;

export const GoogleEventSchema = z.object({
  id: z.string().min(1).max(1024),
  etag: z.string().max(200).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  iCalUID: text(1000).optional(),
  summary: text(10_000).optional(),
  description: text(100_000).optional(),
  location: text(10_000).optional(),
  updated: z.iso.datetime({ offset: true }).optional(),
  sequence: z.number().int().nonnegative().optional(),
  start: GoogleEventDateTimeSchema.optional(),
  end: GoogleEventDateTimeSchema.optional(),
  recurrence: z.array(text(10_000)).max(200).optional(),
  recurringEventId: z.string().max(1024).optional(),
  originalStartTime: GoogleEventDateTimeSchema.optional(),
  organizer: PersonSchema.optional(),
  creator: PersonSchema.optional(),
  attendees: z.array(GoogleAttendeeSchema).max(2000).optional(),
});
export type GoogleEvent = z.infer<typeof GoogleEventSchema>;

export const GoogleEventListSchema = z.object({
  items: z.array(GoogleEventSchema).default([]),
  nextPageToken: z.string().min(1).optional(),
  nextSyncToken: z.string().min(1).optional(),
  timeZone: text(64).optional(),
});

export const GoogleCalendarListEntrySchema = z.object({
  id: z.string().min(1).max(1024),
  summary: text(1000).optional(),
  summaryOverride: text(1000).optional(),
  backgroundColor: text(20).optional(),
  primary: z.boolean().optional(),
  selected: z.boolean().optional(),
  deleted: z.boolean().optional(),
  accessRole: z.enum(['freeBusyReader', 'reader', 'writer', 'owner']),
  timeZone: text(64).optional(),
});

export const GoogleCalendarListSchema = z.object({
  items: z.array(GoogleCalendarListEntrySchema).default([]),
  nextPageToken: z.string().min(1).optional(),
});

export const GoogleApiErrorSchema = z.object({
  error: z.object({
    code: z.number().int().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});
