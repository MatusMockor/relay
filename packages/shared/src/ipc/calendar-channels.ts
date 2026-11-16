import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import {
  CalendarInvitationsQuerySchema,
  CalendarOccurrenceListSchema,
  CalendarRsvpBodySchema,
  CalendarWindowQuerySchema,
  CreateCalendarSubscriptionBodySchema,
  UpdateCalendarSubscriptionBodySchema,
} from '../api/endpoints/calendar';
import { CalendarInvitationSchema } from '../domain/calendar-event';
import { CalendarSubscriptionSchema } from '../domain/calendar-subscription';
import { CalendarEventIdSchema, CalendarSubscriptionIdSchema } from '../domain/ids';
import { invokeChannel } from './define';

const subscriptionRef = z.object({ subscriptionId: CalendarSubscriptionIdSchema });

export const calendarInvokeChannels = {
  'local.calendar.occurrences': invokeChannel(
    CalendarWindowQuerySchema,
    CalendarOccurrenceListSchema,
  ),
  'local.calendar.invitations': invokeChannel(
    CalendarInvitationsQuerySchema,
    z.array(CalendarInvitationSchema),
  ),
  'local.calendar.rsvp': invokeChannel(
    CalendarRsvpBodySchema.extend({ eventId: CalendarEventIdSchema }),
    CalendarInvitationSchema,
  ),
  'local.calendar.subscriptions.list': invokeChannel(
    z.undefined(),
    z.array(CalendarSubscriptionSchema),
  ),
  'local.calendar.subscriptions.create': invokeChannel(
    CreateCalendarSubscriptionBodySchema,
    CalendarSubscriptionSchema,
  ),
  'local.calendar.subscriptions.update': invokeChannel(
    subscriptionRef.extend({ patch: UpdateCalendarSubscriptionBodySchema }),
    CalendarSubscriptionSchema,
  ),
  'local.calendar.subscriptions.delete': invokeChannel(subscriptionRef, OkResponseSchema),
  'local.calendar.subscriptions.refresh': invokeChannel(
    subscriptionRef,
    CalendarSubscriptionSchema,
  ),
};
