import { z } from 'zod';
import { CalendarRsvpResponseSchema } from '../../domain/calendar-event';
import {
  GoogleCalendarConnectionSchema,
  GoogleCalendarOverviewSchema,
  GoogleCalendarSchema,
} from '../../domain/google-calendar';
import {
  CalendarConnectionIdSchema,
  CalendarEventIdSchema,
  GoogleCalendarIdSchema,
} from '../../domain/ids';
import { EmailAddressSchema, HexColorSchema, IsoDateTimeSchema } from '../../domain/primitives';
import { TimeZoneSchema } from '../../domain/time-zone';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';
import { OAuthGrantSchema } from './accounts';

const MAX_EVENT_DAYS = 366;
const DAY_MS = 86_400_000;

export const ConnectGoogleCalendarBodySchema = z.object({ oauth: OAuthGrantSchema });
export type ConnectGoogleCalendarBody = z.infer<typeof ConnectGoogleCalendarBodySchema>;

export const UpdateGoogleCalendarBodySchema = z.object({
  enabled: z.boolean().optional(),
  color: HexColorSchema.optional(),
});
export type UpdateGoogleCalendarBody = z.infer<typeof UpdateGoogleCalendarBodySchema>;

export const CreateCalendarEventBodySchema = z
  .object({
    calendarId: GoogleCalendarIdSchema,
    title: z.string().trim().min(1).max(500),
    allDay: z.boolean(),
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
    timeZone: TimeZoneSchema,
    location: z.string().trim().max(500).nullable(),
    attendees: z.array(EmailAddressSchema).max(100),
  })
  .refine((body) => Date.parse(body.end) > Date.parse(body.start), 'end must be after start')
  .refine(
    (body) => Date.parse(body.end) - Date.parse(body.start) <= MAX_EVENT_DAYS * DAY_MS,
    `An event must not be longer than ${String(MAX_EVENT_DAYS)} days`,
  );
export type CreateCalendarEventBody = z.infer<typeof CreateCalendarEventBodySchema>;

export const CreatedCalendarEventSchema = z.object({ eventId: CalendarEventIdSchema });
export type CreatedCalendarEvent = z.infer<typeof CreatedCalendarEventSchema>;

export const GoogleRsvpBodySchema = z.object({ response: CalendarRsvpResponseSchema });
export type GoogleRsvpBody = z.infer<typeof GoogleRsvpBodySchema>;

const connectionParams = idParamsOf(CalendarConnectionIdSchema);
const eventParams = idParamsOf(CalendarEventIdSchema);

export const googleCalendarEndpoints = {
  overview: defineEndpoint({
    method: 'GET',
    path: '/calendar/google',
    auth: 'user',
    response: GoogleCalendarOverviewSchema,
  }),
  connect: defineEndpoint({
    method: 'POST',
    path: '/calendar/google/connections',
    auth: 'user',
    body: ConnectGoogleCalendarBodySchema,
    response: GoogleCalendarConnectionSchema,
  }),
  disconnect: defineEndpoint({
    method: 'DELETE',
    path: '/calendar/google/connections/:id',
    auth: 'user',
    params: connectionParams,
    response: OkResponseSchema,
  }),
  sync: defineEndpoint({
    method: 'POST',
    path: '/calendar/google/connections/:id/sync',
    auth: 'user',
    params: connectionParams,
    response: GoogleCalendarConnectionSchema,
  }),
  updateCalendar: defineEndpoint({
    method: 'PATCH',
    path: '/calendar/google/calendars/:id',
    auth: 'user',
    params: idParamsOf(GoogleCalendarIdSchema),
    body: UpdateGoogleCalendarBodySchema,
    response: GoogleCalendarSchema,
  }),
  createEvent: defineEndpoint({
    method: 'POST',
    path: '/calendar/google/events',
    auth: 'user',
    body: CreateCalendarEventBodySchema,
    response: CreatedCalendarEventSchema,
  }),
  deleteEvent: defineEndpoint({
    method: 'DELETE',
    path: '/calendar/google/events/:id',
    auth: 'user',
    params: eventParams,
    response: OkResponseSchema,
  }),
  respond: defineEndpoint({
    method: 'POST',
    path: '/calendar/google/events/:id/rsvp',
    auth: 'user',
    params: eventParams,
    body: GoogleRsvpBodySchema,
    response: OkResponseSchema,
  }),
};
