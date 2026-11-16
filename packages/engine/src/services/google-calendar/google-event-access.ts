import { isWritableAccessRole, type GoogleCalendarAccessRole } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';

export interface OccurrenceAccess {
  readonly canDelete: boolean;
  readonly canRespond: boolean;
}

export const NO_ACCESS: OccurrenceAccess = { canDelete: false, canRespond: false };

export const isOwnEvent = (event: StoredCalendarEvent): boolean =>
  event.organizer === null ||
  (event.myEmail !== null && event.organizer.email.toLowerCase() === event.myEmail.toLowerCase());

export const canDeleteGoogleEvent = (
  event: StoredCalendarEvent,
  role: GoogleCalendarAccessRole,
): boolean => isWritableAccessRole(role) && isOwnEvent(event);

export const canRespondToGoogleEvent = (
  event: StoredCalendarEvent,
  role: GoogleCalendarAccessRole,
): boolean =>
  isWritableAccessRole(role) &&
  event.status !== 'cancelled' &&
  event.myPartstat !== null &&
  !isOwnEvent(event);

export const accessOf = (
  event: StoredCalendarEvent,
  role: GoogleCalendarAccessRole | undefined,
): OccurrenceAccess => {
  if (event.source.kind !== 'google' || role === undefined) {
    return NO_ACCESS;
  }
  return {
    canDelete: canDeleteGoogleEvent(event, role),
    canRespond: canRespondToGoogleEvent(event, role),
  };
};
