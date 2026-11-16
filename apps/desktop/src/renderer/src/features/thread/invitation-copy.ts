import type { CalendarInvitation, CalendarRsvpResponse } from '@relay/shared';
import { dm, WEEKDAYS } from '../../lib/dates';
import { capitalize, plural } from '../../lib/text';
import { spanLabel } from '../calendar/calendar-time';

export const RESPONSES: readonly (readonly [CalendarRsvpResponse, string])[] = [
  ['accepted', 'Prijať'],
  ['tentative', 'Možno'],
  ['declined', 'Odmietnuť'],
];

const ANSWERED: Partial<Record<NonNullable<CalendarInvitation['myStatus']>, string>> = {
  accepted: 'Prijaté',
  tentative: 'Možno',
  declined: 'Odmietnuté',
  delegated: 'Delegované',
};

export const headlineOf = (invitation: CalendarInvitation): string => {
  if (invitation.status === 'cancelled') {
    return 'Udalosť bola zrušená';
  }
  if (invitation.method === 'PUBLISH') {
    return 'Udalosť v kalendári';
  }
  const answered = invitation.myStatus === null ? undefined : ANSWERED[invitation.myStatus];
  return answered === undefined ? 'Pozvánka · čaká na tvoju odpoveď' : `Pozvánka · ${answered}`;
};

export const whenOf = (invitation: CalendarInvitation): string => {
  const start = new Date(invitation.start);
  const day = `${capitalize(WEEKDAYS[start.getDay()] ?? '')} ${dm(start)}`;
  const repeat = invitation.recurring ? ' · opakuje sa' : '';
  return `${day} · ${spanLabel(invitation)}${repeat}`;
};

export const peopleOf = (invitation: CalendarInvitation): string | null => {
  const organizer = invitation.organizer?.name ?? invitation.organizer?.email ?? null;
  const count = invitation.attendees.length;
  const guests =
    count === 0 ? null : `${String(count)} ${plural(count, 'účastník', 'účastníci', 'účastníkov')}`;
  const parts = [organizer === null ? null : `Organizuje ${organizer}`, guests].filter(
    (part) => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' · ');
};

export const conflictOf = (invitation: CalendarInvitation): string | null => {
  const [first, ...rest] = invitation.conflicts;
  if (first === undefined) {
    return null;
  }
  const more = rest.length === 0 ? '' : ` a ${String(rest.length)} ďalšie`;
  return `Koliduje s: ${first.title} (${spanLabel(first)})${more}`;
};
