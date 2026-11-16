import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createGoogleCalendarHandlers = (
  services: Pick<EngineServices, 'googleCalendar'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.calendar.google.overview': () => services.googleCalendar.overview(userId),
  'local.calendar.google.disconnect': async ({ connectionId }) => {
    await services.googleCalendar.disconnect(userId, connectionId);
    return { ok: true };
  },
  'local.calendar.google.sync': ({ connectionId }) =>
    services.googleCalendar.sync(userId, connectionId),
  'local.calendar.google.updateCalendar': ({ calendarId, patch }) =>
    services.googleCalendar.updateCalendar(userId, calendarId, patch),
  'local.calendar.google.createEvent': (body) => services.googleCalendar.createEvent(userId, body),
  'local.calendar.google.deleteEvent': async ({ eventId }) => {
    await services.googleCalendar.deleteEvent(userId, eventId);
    return { ok: true };
  },
  'local.calendar.google.respond': async ({ eventId, response }) => {
    await services.googleCalendar.respond(userId, eventId, response);
    return { ok: true };
  },
});
