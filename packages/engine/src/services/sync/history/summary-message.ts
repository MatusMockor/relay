import type { MessageHeaders } from '../../../model/split-match-subject';
import type { ParsedMessage } from '../../../model/parsed-message';
import type { RemoteMessageSummary } from '../../../model/remote-mail';
import type { MessageParser } from '../../../ports/message-parser';
import { isTraceHeader } from './trace-headers';

const CR = 13;
const LF = 10;

const endsWith = (bytes: Uint8Array, suffix: readonly number[]): boolean =>
  bytes.length >= suffix.length &&
  suffix.every((byte, index) => bytes[bytes.length - suffix.length + index] === byte);

const terminator = (header: Uint8Array): number[] => {
  if (endsWith(header, [CR, LF, CR, LF])) {
    return [];
  }
  if (endsWith(header, [CR, LF])) {
    return [CR, LF];
  }
  return [CR, LF, CR, LF];
};

export const headerSource = (header: Uint8Array): Uint8Array => {
  const tail = terminator(header);
  const source = new Uint8Array(header.length + tail.length);
  source.set(header);
  source.set(tail, header.length);
  return source;
};

const compactHeaders = (headers: MessageHeaders): MessageHeaders =>
  new Map([...headers].filter(([name]) => !isTraceHeader(name)));

export const summaryMessage = async (
  parser: MessageParser,
  summary: RemoteMessageSummary,
): Promise<ParsedMessage> => {
  const parsed = await parser.parse(headerSource(summary.header));
  return {
    ...parsed,
    textBody: null,
    htmlBody: null,
    snippet: summary.snippet,
    headers: compactHeaders(parsed.headers),
    attachments: summary.attachments.map((attachment) => ({ ...attachment, checksum: '' })),
    calendarParts: [],
  };
};
