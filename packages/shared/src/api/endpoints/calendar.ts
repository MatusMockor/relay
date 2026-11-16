import { z } from 'zod';
import {
  CalendarInvitationSchema,
  CalendarOccurrenceSchema,
  CalendarRsvpResponseSchema,
} from '../../domain/calendar-event';
import {
  CalendarFeedUrlSchema,
  CalendarSubscriptionSchema,
} from '../../domain/calendar-subscription';
import {
  CalendarEventIdSchema,
  CalendarSubscriptionIdSchema,
  ThreadIdSchema,
} from '../../domain/ids';
import { HexColorSchema, IsoDateTimeSchema } from '../../domain/primitives';
import { TimeZoneSchema } from '../../domain/time-zone';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const CALENDAR_WINDOW_MAX_DAYS = 62;
const DAY_MS = 86_400_000;

export const CalendarWindowQuerySchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
    timeZone: TimeZoneSchema,
  })
  .refine((query) => Date.parse(query.to) > Date.parse(query.from), 'to must be after from')
  .refine(
    (query) => Date.parse(query.to) - Date.parse(query.from) <= CALENDAR_WINDOW_MAX_DAYS * DAY_MS,
    `The window must not exceed ${String(CALENDAR_WINDOW_MAX_DAYS)} days`,
  );
export type CalendarWindowQuery = z.infer<typeof CalendarWindowQuerySchema>;

export const CalendarOccurrenceListSchema = z.object({
  items: z.array(CalendarOccurrenceSchema),
});
export type CalendarOccurrenceList = z.infer<typeof CalendarOccurrenceListSchema>;

export const CalendarInvitationsQuerySchema = z.object({
  threadId: ThreadIdSchema,
  timeZone: TimeZoneSchema,
});
export type CalendarInvitationsQuery = z.infer<typeof CalendarInvitationsQuerySchema>;

export const CalendarRsvpBodySchema = z.object({
  response: CalendarRsvpResponseSchema,
  timeZone: TimeZoneSchema,
});
export type CalendarRsvpBody = z.infer<typeof CalendarRsvpBodySchema>;

export const CreateCalendarSubscriptionBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: CalendarFeedUrlSchema,
  color: HexColorSchema,
});
export type CreateCalendarSubscriptionBody = z.infer<typeof CreateCalendarSubscriptionBodySchema>;

export const UpdateCalendarSubscriptionBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: HexColorSchema.optional(),
});
export type UpdateCalendarSubscriptionBody = z.infer<typeof UpdateCalendarSubscriptionBodySchema>;

const subscriptionParams = idParamsOf(CalendarSubscriptionIdSchema);

export const calendarEndpoints = {
  occurrences: defineEndpoint({
    method: 'GET',
    path: '/calendar/occurrences',
    auth: 'user',
    query: CalendarWindowQuerySchema,
    response: CalendarOccurrenceListSchema,
  }),
  invitations: defineEndpoint({
    method: 'GET',
    path: '/calendar/invitations',
    auth: 'user',
    query: CalendarInvitationsQuerySchema,
    response: z.array(CalendarInvitationSchema),
  }),
  rsvp: defineEndpoint({
    method: 'POST',
    path: '/calendar/events/:id/rsvp',
    auth: 'user',
    params: idParamsOf(CalendarEventIdSchema),
    body: CalendarRsvpBodySchema,
    response: CalendarInvitationSchema,
  }),
  listSubscriptions: defineEndpoint({
    method: 'GET',
    path: '/calendar/subscriptions',
    auth: 'user',
    response: z.array(CalendarSubscriptionSchema),
  }),
  createSubscription: defineEndpoint({
    method: 'POST',
    path: '/calendar/subscriptions',
    auth: 'user',
    body: CreateCalendarSubscriptionBodySchema,
    response: CalendarSubscriptionSchema,
  }),
  updateSubscription: defineEndpoint({
    method: 'PATCH',
    path: '/calendar/subscriptions/:id',
    auth: 'user',
    params: subscriptionParams,
    body: UpdateCalendarSubscriptionBodySchema,
    response: CalendarSubscriptionSchema,
  }),
  deleteSubscription: defineEndpoint({
    method: 'DELETE',
    path: '/calendar/subscriptions/:id',
    auth: 'user',
    params: subscriptionParams,
    response: OkResponseSchema,
  }),
  refreshSubscription: defineEndpoint({
    method: 'POST',
    path: '/calendar/subscriptions/:id/refresh',
    auth: 'user',
    params: subscriptionParams,
    response: CalendarSubscriptionSchema,
  }),
};
