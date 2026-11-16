import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { GoogleCalendarOAuthCoordinator } from '../oauth/google-calendar-oauth-coordinator';

export const createGoogleCalendarOAuthHandlers = (
  coordinator: GoogleCalendarOAuthCoordinator,
): IpcInvokeHandlers => ({
  'oauth.google.authorizeCalendar': (input) => coordinator.authorize(input),
});
