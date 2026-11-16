import type { CalendarAttendee } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../../model/calendar';
import { findAttendee } from '../event-precedence';

const stampOf = (value: string | null | undefined): number =>
  value === null || value === undefined ? 0 : Date.parse(value);

const answered = (attendee: CalendarAttendee | null): attendee is CalendarAttendee =>
  attendee !== null && stampOf(attendee.repliedAt) > 0;

const keptAnswer = (fresh: CalendarAttendee, old: CalendarAttendee | null): CalendarAttendee => {
  if (!answered(old) || stampOf(old.repliedAt) <= stampOf(fresh.repliedAt)) {
    return fresh;
  }
  return { ...fresh, partstat: old.partstat, repliedAt: old.repliedAt ?? null };
};

const attendeesOf = (fresh: StoredCalendarEvent, old: StoredCalendarEvent): CalendarAttendee[] => {
  const merged = fresh.attendees.map((attendee) =>
    keptAnswer(attendee, findAttendee(old.attendees, attendee.email)),
  );
  const extra = old.attendees.filter(
    (attendee) => answered(attendee) && findAttendee(fresh.attendees, attendee.email) === null,
  );
  return [...merged, ...extra];
};

const myPartstatOf = (
  fresh: StoredCalendarEvent,
  old: StoredCalendarEvent,
  attendees: readonly CalendarAttendee[],
) => {
  const email = fresh.myEmail ?? old.myEmail;
  const mine = email === null ? null : findAttendee(attendees, email);
  if (answered(mine)) {
    return mine.partstat;
  }
  if (
    old.myPartstat === null ||
    (fresh.myPartstat !== null && fresh.myPartstat !== 'needs-action')
  ) {
    return fresh.myPartstat;
  }
  return old.myPartstat;
};

export const withKeptResponses = (
  fresh: StoredCalendarEvent,
  old: StoredCalendarEvent | undefined,
): StoredCalendarEvent => {
  if (old === undefined || fresh.sequence > old.sequence) {
    return fresh;
  }
  const attendees = attendeesOf(fresh, old);
  return {
    ...fresh,
    attendees,
    myPartstat: myPartstatOf(fresh, old, attendees),
    myEmail: fresh.myEmail ?? old.myEmail,
  };
};
