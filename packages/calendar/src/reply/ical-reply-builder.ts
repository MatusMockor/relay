import type { CalendarReplyBuilder, CalendarReplyInput } from '@relay/engine';
import type { CalendarRsvpResponse } from '@relay/shared/domain';
import ICAL from 'ical.js';
import { cloneComponent, jcalOf, newCalendar, parseCalendar } from '../ics/standalone-ics';

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;

const PARTSTAT: Record<CalendarRsvpResponse, string> = {
  accepted: 'ACCEPTED',
  tentative: 'TENTATIVE',
  declined: 'DECLINED',
};

const COPIED = ['uid', 'organizer', 'recurrence-id', 'dtstart', 'dtend', 'duration', 'summary'];

const mailtoOf = (email: string): string => `mailto:${email}`;

const isMine = (property: Property, email: string): boolean => {
  const value: unknown = property.getFirstValue();
  return (
    typeof value === 'string' &&
    value
      .replace(/^mailto:/i, '')
      .trim()
      .toLowerCase() === email.toLowerCase()
  );
};

const attendeeFor = (original: Component, input: CalendarReplyInput): Property => {
  const known = original
    .getAllProperties('attendee')
    .find((property) => isMine(property, input.attendee.email));
  const attendee = new ICAL.Property('attendee');
  attendee.setValue(mailtoOf(input.attendee.email));
  for (const name of ['cutype', 'role']) {
    const value: unknown = known?.getParameter(name);
    if (typeof value === 'string') {
      attendee.setParameter(name, value);
    }
  }
  attendee.setParameter('partstat', PARTSTAT[input.response]);
  if (input.attendee.name !== null && input.attendee.name.trim() !== '') {
    attendee.setParameter('cn', input.attendee.name);
  }
  return attendee;
};

const replyEvent = (original: Component, input: CalendarReplyInput): Component => {
  const reply = new ICAL.Component('vevent');
  for (const name of COPIED) {
    const property = original.getFirstProperty(name);
    if (property !== null) {
      reply.addProperty(new ICAL.Property(jcalOf(property)));
    }
  }
  reply.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(input.dtstamp), true));
  reply.addPropertyWithValue('sequence', input.event.sequence);
  reply.addProperty(attendeeFor(original, input));
  return reply;
};

export class IcalReplyBuilder implements CalendarReplyBuilder {
  build(input: CalendarReplyInput): string {
    const source = parseCalendar(input.event.ics);
    const original = source?.getFirstSubcomponent('vevent') ?? null;
    if (source === null || original === null) {
      throw new Error('The stored invitation cannot be parsed');
    }
    const calendar = newCalendar('REPLY');
    for (const zone of source.getAllSubcomponents('vtimezone')) {
      calendar.addSubcomponent(cloneComponent(zone));
    }
    calendar.addSubcomponent(replyEvent(original, input));
    return calendar.toString();
  }
}
