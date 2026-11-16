import type { MailboxRole } from '@relay/shared/domain';
import type { RawMessage, RemoteMailbox } from '../../../src';
import type { FakeMailbox, RemoteMessageRecord } from './fake-mail-server';

export const toRaw = (path: string, record: RemoteMessageRecord): RawMessage => ({
  mailboxPath: path,
  uid: record.uid,
  flags: { ...record.flags },
  keywords: [...record.keywords],
  internalDate: record.internalDate,
  size: record.source.byteLength,
  modseq: record.modseq.toString(),
  source: new Uint8Array(record.source),
});

const CALENDAR_HEADER = /^X-Test-Calendar:\s*(.+)$/gim;

export const calendarHeaders = (source: Uint8Array): string[] => {
  const text = new TextDecoder().decode(source);
  const headers = text.split('\r\n\r\n')[0] ?? '';
  return [...headers.matchAll(CALENDAR_HEADER)].map((match) => (match[1] ?? '').trim());
};

export const CREATED_ROLES: ReadonlyMap<string, MailboxRole> = new Map([
  ['Archive', 'archive'],
  ['Sent', 'sent'],
  ['Trash', 'trash'],
  ['Drafts', 'drafts'],
]);

export const toRemote = (mailbox: FakeMailbox): RemoteMailbox => ({
  path: mailbox.path,
  name: mailbox.name,
  delimiter: '/',
  role: mailbox.role,
  subscribed: true,
});

export const missing = (what: string): Promise<never> =>
  Promise.reject(new Error(`${what} does not exist`));
