import type { RemoteAttachmentMeta, RemoteMessageSummary, UidListOptions } from '../../../src';
import type { FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import { calendarHeaders } from './fake-records';

const SEPARATOR = new Uint8Array([13, 10, 13, 10]);

const headerEnd = (source: Uint8Array): number => {
  for (let index = 0; index + SEPARATOR.length <= source.length; index += 1) {
    if (SEPARATOR.every((byte, offset) => source[index + offset] === byte)) {
      return index + SEPARATOR.length;
    }
  }
  return source.length;
};

const calendarAttachment = (token: string): RemoteAttachmentMeta => ({
  filename: 'invite.ics',
  contentType: 'text/calendar',
  size: token.length,
  contentId: null,
  inline: false,
});

export const summaryOf = (record: RemoteMessageRecord): RemoteMessageSummary => {
  const end = headerEnd(record.source);
  const body = new TextDecoder().decode(record.source.slice(end));
  return {
    uid: record.uid,
    flags: { ...record.flags },
    keywords: [...record.keywords],
    labels: record.labels === null ? null : [...record.labels],
    emailId: record.emailId,
    internalDate: record.internalDate,
    size: record.source.byteLength,
    modseq: record.modseq.toString(),
    header: record.source.slice(0, end),
    snippet: body.replace(/\s+/g, ' ').trim().slice(0, 140),
    attachments: calendarHeaders(record.source).map(calendarAttachment),
  };
};

const inScope = (sorted: readonly number[], options: UidListOptions): number[] => {
  const { range, among, newest } = options;
  if (among !== undefined) {
    const wanted = new Set(among);
    return sorted.filter((uid) => wanted.has(uid));
  }
  if (newest !== undefined) {
    return sorted.slice(Math.max(0, sorted.length - newest));
  }
  return sorted.filter((uid) => range === undefined || (uid >= range.from && uid <= range.to));
};

export const uidsInRange = (uids: Iterable<number>, options: UidListOptions): number[] =>
  inScope(
    [...uids].sort((left, right) => left - right),
    options,
  );

export const recordUidSearch = (
  server: FakeMailServer,
  path: string,
  options: UidListOptions,
): void => {
  server.uidListings.push(options.fresh === true ? `fresh:${path}` : path);
  server.uidQueries.push({ path, options });
  const range = options.range;
  if (range === undefined) {
    return;
  }
  server.uidSearches.push(range);
  server.onUidSearch?.(range);
};
