import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { OAuthGrantSchema } from '../api/endpoints/accounts';
import {
  CreateCalendarEventBodySchema,
  CreatedCalendarEventSchema,
  GoogleRsvpBodySchema,
  UpdateGoogleCalendarBodySchema,
} from '../api/endpoints/google-calendar';
import {
  GoogleCalendarConnectionSchema,
  GoogleCalendarOverviewSchema,
  GoogleCalendarSchema,
} from '../domain/google-calendar';
import {
  CalendarConnectionIdSchema,
  CalendarEventIdSchema,
  GoogleCalendarIdSchema,
} from '../domain/ids';
import { EmailAddressSchema } from '../domain/primitives';
import { AppModeSchema } from '../domain/settings';
import { invokeChannel } from './define';

export const GoogleCalendarAuthorizeInputSchema = z.object({
  mode: AppModeSchema,
  loginHint: EmailAddressSchema.optional(),
});
export type GoogleCalendarAuthorizeInput = z.infer<typeof GoogleCalendarAuthorizeInputSchema>;

export const GoogleCalendarAuthorizeOutputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local'), connection: GoogleCalendarConnectionSchema }),
  z.object({ mode: z.literal('synced'), grant: OAuthGrantSchema }),
]);
export type GoogleCalendarAuthorizeOutput = z.infer<typeof GoogleCalendarAuthorizeOutputSchema>;

const connectionRef = z.object({ connectionId: CalendarConnectionIdSchema });
const eventRef = z.object({ eventId: CalendarEventIdSchema });

export const googleCalendarInvokeChannels = {
  'oauth.google.authorizeCalendar': invokeChannel(
    GoogleCalendarAuthorizeInputSchema,
    GoogleCalendarAuthorizeOutputSchema,
  ),
  'local.calendar.google.overview': invokeChannel(z.undefined(), GoogleCalendarOverviewSchema),
  'local.calendar.google.disconnect': invokeChannel(connectionRef, OkResponseSchema),
  'local.calendar.google.sync': invokeChannel(connectionRef, GoogleCalendarConnectionSchema),
  'local.calendar.google.updateCalendar': invokeChannel(
    z.object({ calendarId: GoogleCalendarIdSchema, patch: UpdateGoogleCalendarBodySchema }),
    GoogleCalendarSchema,
  ),
  'local.calendar.google.createEvent': invokeChannel(
    CreateCalendarEventBodySchema,
    CreatedCalendarEventSchema,
  ),
  'local.calendar.google.deleteEvent': invokeChannel(eventRef, OkResponseSchema),
  'local.calendar.google.respond': invokeChannel(
    eventRef.extend(GoogleRsvpBodySchema.shape),
    OkResponseSchema,
  ),
};
