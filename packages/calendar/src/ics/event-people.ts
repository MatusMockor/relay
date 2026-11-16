import type { Address, CalendarAttendee, CalendarPartStat } from '@relay/shared/domain';
import { EmailAddressSchema } from '@relay/shared/domain';
import type ICAL from 'ical.js';

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;

const PARTSTATS: Record<string, CalendarPartStat> = {
  'NEEDS-ACTION': 'needs-action',
  ACCEPTED: 'accepted',
  TENTATIVE: 'tentative',
  DECLINED: 'declined',
  DELEGATED: 'delegated',
};

const MAX_ATTENDEES = 500;

const parameter = (property: Property, name: string): string | null => {
  const value: unknown = property.getParameter(name);
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  return null;
};

const addressOf = (property: Property): Address | null => {
  const raw: unknown = property.getFirstValue();
  if (typeof raw !== 'string') {
    return null;
  }
  const parsed = EmailAddressSchema.safeParse(
    raw
      .replace(/^mailto:/i, '')
      .trim()
      .toLowerCase(),
  );
  if (!parsed.success) {
    return null;
  }
  return { name: parameter(property, 'cn')?.slice(0, 500) ?? null, email: parsed.data };
};

export const organizerOf = (vevent: Component): Address | null => {
  const property = vevent.getFirstProperty('organizer');
  return property === null ? null : addressOf(property);
};

export const partstatOf = (property: Property): CalendarPartStat =>
  PARTSTATS[(parameter(property, 'partstat') ?? '').toUpperCase()] ?? 'needs-action';

export const attendeesOf = (vevent: Component): CalendarAttendee[] =>
  vevent
    .getAllProperties('attendee')
    .slice(0, MAX_ATTENDEES)
    .flatMap((property) => {
      const address = addressOf(property);
      if (address === null) {
        return [];
      }
      return [
        {
          ...address,
          partstat: partstatOf(property),
          role: parameter(property, 'role')?.slice(0, 40) ?? null,
        },
      ];
    });
