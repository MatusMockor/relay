import type { MailboxRole, MessageFlags } from '@relay/shared/domain';
import type {
  DeliveryOptions,
  FakeMailbox,
  FakeMailServer,
  RemoteMessageRecord,
} from './fake-mail-server';

export interface GmailMessageState {
  readonly emailId: string;
  readonly source: Uint8Array;
  flags: MessageFlags;
  keywords: string[];
  labels: string[];
  readonly internalDate: string;
}

export interface GmailMembership {
  readonly mailbox: FakeMailbox;
  readonly record: RemoteMessageRecord;
}

const NO_FLAGS: MessageFlags = { seen: false, flagged: false, answered: false };
const DEFAULT_INTERNAL_DATE = '2026-11-15T08:00:00.000Z';
const MESSAGE_ID = /^Message-ID:\s*<([^>]+)>/im;
const OUTSIDE_ALL_MAIL: ReadonlySet<MailboxRole> = new Set(['archive', 'trash', 'spam']);

export const removesEveryLabel = (role: MailboxRole): boolean =>
  role === 'trash' || role === 'spam';

const defaultEmailId = (server: FakeMailServer, source: Uint8Array): string => {
  const headers = new TextDecoder().decode(source).split('\r\n\r\n')[0] ?? '';
  const messageId = MESSAGE_ID.exec(headers)?.[1];
  return `gm-${messageId ?? server.nextGmailId()}`;
};

export const gmailRecord = (
  state: GmailMessageState,
  uid: number,
  modseq: bigint,
): RemoteMessageRecord => ({
  uid,
  modseq,
  get source() {
    return state.source;
  },
  get flags() {
    return state.flags;
  },
  set flags(flags: MessageFlags) {
    state.flags = flags;
  },
  get keywords() {
    return state.keywords;
  },
  set keywords(keywords: string[]) {
    state.keywords = keywords;
  },
  get labels(): string[] | null {
    return state.labels;
  },
  set labels(labels: string[] | null) {
    state.labels = labels ?? [];
  },
  get emailId() {
    return state.emailId;
  },
  get internalDate() {
    return state.internalDate;
  },
});

export const stateOf = (
  server: FakeMailServer,
  source: Uint8Array,
  options: DeliveryOptions,
): GmailMessageState => {
  const emailId = options.emailId ?? defaultEmailId(server, source);
  const known = server.gmailMessages.get(emailId);
  if (known !== undefined) {
    return known;
  }
  const state: GmailMessageState = {
    emailId,
    source: new Uint8Array(source),
    flags: { ...NO_FLAGS, ...options.flags },
    keywords: [...(options.keywords ?? [])],
    labels: [...(options.labels ?? [])],
    internalDate: options.internalDate ?? DEFAULT_INTERNAL_DATE,
  };
  server.gmailMessages.set(emailId, state);
  return state;
};

export const stateOfRecord = (
  server: FakeMailServer,
  record: RemoteMessageRecord,
): GmailMessageState => stateOf(server, record.source, record);

export const membershipsOf = (server: FakeMailServer, emailId: string): GmailMembership[] =>
  [...server.mailboxes.values()].flatMap((mailbox) =>
    [...mailbox.messages.values()]
      .filter((record) => record.emailId === emailId)
      .map((record) => ({ mailbox, record })),
  );

export const addMembership = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  state: GmailMessageState,
): number => {
  const held = [...mailbox.messages.values()].find((record) => record.emailId === state.emailId);
  if (held !== undefined) {
    return held.uid;
  }
  const uid = mailbox.uidNext;
  mailbox.uidNext += 1;
  mailbox.messages.set(uid, gmailRecord(state, uid, server.bumpModseq(mailbox)));
  server.notify({ type: 'exists', mailboxPath: mailbox.path, count: mailbox.messages.size });
  return uid;
};

export const dropMembership = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  emailId: string,
): void => {
  const held = [...mailbox.messages.values()].find((record) => record.emailId === emailId);
  if (held !== undefined) {
    server.expunge(mailbox.path, held.uid);
  }
};

export const ensureAllMail = (server: FakeMailServer, state: GmailMessageState): void => {
  const allMail = [...server.mailboxes.values()].find((mailbox) => mailbox.role === 'archive');
  if (allMail !== undefined) {
    addMembership(server, allMail, state);
  }
};

export const deliverGmail = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  source: Uint8Array,
  options: DeliveryOptions,
): number => {
  const state = stateOf(server, source, options);
  const uid = addMembership(server, mailbox, state);
  if (options.allMail !== false && !OUTSIDE_ALL_MAIL.has(mailbox.role)) {
    ensureAllMail(server, state);
  }
  return uid;
};

export const touchMemberships = (server: FakeMailServer, emailId: string): void => {
  membershipsOf(server, emailId).forEach(({ mailbox, record }) => {
    record.modseq = server.bumpModseq(mailbox);
    server.notify({ type: 'flags', mailboxPath: mailbox.path, uid: record.uid });
  });
};

export const forgetUnheld = (server: FakeMailServer, emailId: string | null): void => {
  if (emailId === null || membershipsOf(server, emailId).length > 0) {
    return;
  }
  server.gmailMessages.delete(emailId);
};
