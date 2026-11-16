import type { Attachment } from 'mailparser';

const CALENDAR_TYPES = new Set(['text/calendar', 'application/ics', 'application/x-ics']);
const MAX_PART_BYTES = 1024 * 1024;
const MAX_PARTS = 5;

const isCalendar = (attachment: Attachment): boolean =>
  CALENDAR_TYPES.has(attachment.contentType.toLowerCase()) ||
  /\.ics$/i.test(attachment.filename ?? '');

export const isCalendarBodyPart = (attachment: Attachment): boolean =>
  attachment.contentType.toLowerCase() === 'text/calendar' &&
  (attachment.filename ?? '') === '' &&
  attachment.contentDisposition !== 'attachment';

export const calendarPartsOf = (attachments: readonly Attachment[]): string[] => {
  const texts = attachments
    .filter((attachment) => isCalendar(attachment) && attachment.size <= MAX_PART_BYTES)
    .map((attachment) => attachment.content.toString('utf8'))
    .filter((text) => /BEGIN:VCALENDAR/i.test(text));
  return [...new Set(texts)].slice(0, MAX_PARTS);
};
