import type { Clock, MessageParser, ParsedAttachment, ParsedMessage } from '@relay/engine';
import { simpleParser, type Attachment } from 'mailparser';
import { firstAddress, toAddresses } from './addresses';
import { normalizeBodyParts } from './body-parts';
import { calendarPartsOf, isCalendarBodyPart } from './calendar-parts';
import { toMessageHeaders } from './header-lines';
import { extractMessageIds, firstMessageId } from './message-ids';
import { buildSnippet } from './snippet';

const isRelated = (attachment: { readonly related?: boolean }): boolean =>
  attachment.related === true;

const toParsedAttachment = (attachment: Attachment): ParsedAttachment => ({
  filename: attachment.filename ?? null,
  contentType: attachment.contentType || 'application/octet-stream',
  size: attachment.size,
  contentId: attachment.cid ?? null,
  inline:
    attachment.contentDisposition === 'inline' ||
    isRelated(attachment) ||
    isCalendarBodyPart(attachment),
  checksum: attachment.checksum,
});

const toIsoDate = (date: Date | undefined, fallback: Date): string => {
  if (date === undefined || Number.isNaN(date.getTime())) {
    return fallback.toISOString();
  }
  return date.toISOString();
};

const nonEmpty = (value: string | undefined): string | null =>
  value === undefined || value.trim() === '' ? null : value;

export class MailparserMessageParser implements MessageParser {
  constructor(private readonly clock: Clock) {}

  async parse(source: Uint8Array): Promise<ParsedMessage> {
    const parsed = await simpleParser(Buffer.from(source), {
      skipHtmlToText: true,
      skipTextToHtml: true,
      skipImageLinks: true,
    });
    const { textBody, htmlBody } = normalizeBodyParts({
      textBody: nonEmpty(parsed.text),
      htmlBody: parsed.html === false ? null : parsed.html,
    });
    return {
      messageIdHeader: firstMessageId(parsed.messageId),
      inReplyTo: firstMessageId(parsed.inReplyTo),
      references: extractMessageIds(parsed.references),
      from: firstAddress(parsed.from),
      to: toAddresses(parsed.to),
      cc: toAddresses(parsed.cc),
      bcc: toAddresses(parsed.bcc),
      replyTo: toAddresses(parsed.replyTo),
      subject: parsed.subject ?? '',
      date: toIsoDate(parsed.date, this.clock.now()),
      textBody,
      htmlBody,
      snippet: buildSnippet(textBody, htmlBody),
      headers: toMessageHeaders(parsed.headerLines),
      attachments: parsed.attachments.map(toParsedAttachment),
      calendarParts: calendarPartsOf(parsed.attachments),
    };
  }
}
