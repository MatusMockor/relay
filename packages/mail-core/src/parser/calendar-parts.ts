import type { Attachment } from 'mailparser';
import { calendarTexts, isCalendarPart, MAX_CALENDAR_PART_BYTES } from './calendar-part-rules';

export const isCalendarBodyPart = (attachment: Attachment): boolean =>
  attachment.contentType.toLowerCase() === 'text/calendar' &&
  (attachment.filename ?? '') === '' &&
  attachment.contentDisposition !== 'attachment';

export const calendarPartsOf = (attachments: readonly Attachment[]): string[] =>
  calendarTexts(
    attachments
      .filter(
        (attachment) =>
          isCalendarPart(attachment.contentType, attachment.filename) &&
          attachment.size <= MAX_CALENDAR_PART_BYTES,
      )
      .map((attachment) => attachment.content.toString('utf8')),
  );
