import type { MailboxRole } from '@relay/shared/domain';
import type {
  RawMessage,
  RemoteEmailId,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
} from '../../../src';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';

export const toRaw = (path: string, record: RemoteMessageRecord): RawMessage => ({
  mailboxPath: path,
  uid: record.uid,
  flags: { ...record.flags },
  keywords: [...record.keywords],
  labels: record.labels === null ? null : [...record.labels],
  emailId: record.emailId,
  internalDate: record.internalDate,
  size: record.source.byteLength,
  modseq: record.modseq.toString(),
  source: new Uint8Array(record.source),
});

export const emailIdOf = ({ uid, emailId }: RemoteMessageRecord): RemoteEmailId => ({
  uid,
  emailId,
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
  ['Junk', 'spam'],
]);

export const toRemote = (mailbox: FakeMailbox): RemoteMailbox => ({
  path: mailbox.path,
  name: mailbox.name,
  delimiter: '/',
  role: mailbox.role,
  subscribed: mailbox.subscribed,
});

export const missing = (what: string): Promise<never> =>
  Promise.reject(new Error(`${what} does not exist`));

export const flagChangesOf = (
  mailbox: FakeMailbox,
  since: bigint,
  uids: readonly number[] | undefined,
): RemoteFlagChange[] =>
  [...mailbox.messages.values()]
    .filter((record) => record.modseq > since && (uids === undefined || uids.includes(record.uid)))
    .map((record) => ({
      uid: record.uid,
      flags: { ...record.flags },
      keywords: [...record.keywords],
      labels: record.labels === null ? null : [...record.labels],
      modseq: record.modseq.toString(),
    }));

export const statusOf = (server: FakeMailServer, mailbox: FakeMailbox): RemoteMailboxStatus => {
  const records = [...mailbox.messages.values()];
  return {
    path: mailbox.path,
    uidValidity: mailbox.uidValidity,
    uidNext: mailbox.uidNext,
    highestModseq: server.condstore ? server.highestModseq(mailbox).toString() : null,
    messages: records.length,
    unseen: records.filter((record) => !record.flags.seen).length,
  };
};

export const scanFlagChanges = (
  { server, mailbox }: { readonly server: FakeMailServer; readonly mailbox: FakeMailbox },
  path: string,
  sinceModseq: string,
  uids: readonly number[] | undefined,
): RemoteFlagChange[] => {
  server.flagScans.push({ path, uids: uids === undefined ? null : [...uids] });
  return flagChangesOf(mailbox, BigInt(sinceModseq), uids);
};
