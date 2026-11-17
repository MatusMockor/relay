import type { RemoteThreadHeaders } from '../../../src';
import type { RemoteMessageRecord } from './fake-mail-server';

const MESSAGE_ID = /<[^<>\s]+>/g;

const headerIds = (headers: readonly string[], name: string): string[] =>
  headers
    .filter((line) => line.toLowerCase().startsWith(`${name}:`))
    .flatMap((line) => line.match(MESSAGE_ID) ?? []);

export const threadHeadersOf = (record: RemoteMessageRecord): RemoteThreadHeaders => {
  const text = new TextDecoder().decode(record.source);
  const headers = (text.split('\r\n\r\n')[0] ?? '').split('\r\n');
  return {
    uid: record.uid,
    internalDate: record.internalDate,
    messageId: headerIds(headers, 'message-id')[0] ?? null,
    inReplyTo: headerIds(headers, 'in-reply-to'),
    references: headerIds(headers, 'references'),
  };
};
