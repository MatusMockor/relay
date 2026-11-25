import type { RemoteThreadHeaders } from '../../../src';
import type { RemoteMessageRecord } from './fake-mail-server';

const MESSAGE_ID = /<[^<>\s]+>/g;

const headerValue = (headers: readonly string[], name: string): string | null => {
  const line = headers.find((entry) => entry.toLowerCase().startsWith(`${name}:`));
  return line === undefined ? null : line.slice(name.length + 1).trim();
};

const headerIds = (headers: readonly string[], name: string): string[] =>
  headerValue(headers, name)?.match(MESSAGE_ID) ?? [];

const sentAt = (headers: readonly string[], fallback: string): string => {
  const parsed = Date.parse(headerValue(headers, 'date') ?? '');
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};

export const threadHeadersOf = (record: RemoteMessageRecord): RemoteThreadHeaders => {
  const text = new TextDecoder().decode(record.source);
  const headers = (text.split('\r\n\r\n')[0] ?? '').split('\r\n');
  return {
    uid: record.uid,
    internalDate: record.internalDate,
    date: sentAt(headers, record.internalDate),
    subject: headerValue(headers, 'subject') ?? '',
    messageId: headerIds(headers, 'message-id')[0] ?? null,
    inReplyTo: headerIds(headers, 'in-reply-to'),
    references: headerIds(headers, 'references'),
    meta: {
      uid: record.uid,
      flags: { ...record.flags },
      keywords: [...record.keywords],
      labels: record.labels === null ? null : [...record.labels],
      emailId: record.emailId,
      internalDate: record.internalDate,
    },
  };
};
