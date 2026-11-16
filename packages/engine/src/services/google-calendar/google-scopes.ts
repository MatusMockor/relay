export const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_CALENDAR_LIST_SCOPE =
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const GOOGLE_CALENDAR_SCOPES = [GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_LIST_SCOPE];

export const grantsGoogleCalendar = (scope: string | null): boolean => {
  if (scope === null) {
    return false;
  }
  const granted = new Set(scope.split(/\s+/));
  return GOOGLE_CALENDAR_SCOPES.every((required) => granted.has(required));
};
