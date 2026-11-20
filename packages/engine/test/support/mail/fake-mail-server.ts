import type { MailboxRole, MessageFlags } from '@relay/shared/domain';
import type { MailboxChange, UidRange } from '../../../src';
import { present } from '../present';

export interface RemoteMessageRecord {
  readonly uid: number;
  readonly source: Uint8Array;
  flags: MessageFlags;
  keywords: string[];
  labels: string[] | null;
  readonly emailId: string | null;
  readonly internalDate: string;
  modseq: bigint;
}

export interface FakeMailbox {
  readonly path: string;
  readonly name: string;
  readonly role: MailboxRole;
  subscribed: boolean;
  uidValidity: number;
  uidNext: number;
  highestModseq: bigint;
  readonly messages: Map<number, RemoteMessageRecord>;
}

export interface FakeMailServerOptions {
  readonly password?: string;
  readonly condstore?: boolean;
  readonly uidplus?: boolean;
  readonly gmail?: boolean;
}

export interface DeliveryOptions {
  readonly flags?: Partial<MessageFlags>;
  readonly keywords?: readonly string[];
  readonly labels?: readonly string[] | null;
  readonly emailId?: string | null;
  readonly internalDate?: string;
}

export interface LabelWrite {
  readonly path: string;
  readonly uids: readonly number[];
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

const NO_FLAGS: MessageFlags = { seen: false, flagged: false, answered: false };
const DEFAULT_INTERNAL_DATE = '2026-11-15T08:00:00.000Z';

export class FakeMailServer {
  password: string;
  readonly condstore: boolean;
  readonly uidplus: boolean;
  readonly gmail: boolean;
  readonly mailboxes = new Map<string, FakeMailbox>();
  readonly createdMailboxes: string[] = [];
  readonly renamedMailboxes: { path: string; newPath: string }[] = [];
  readonly deletedMailboxes: string[] = [];
  readonly keywordPurges: { path: string; keyword: string }[] = [];
  readonly folderCommands: string[] = [];
  readonly fetchedMessages: { path: string; uid: number }[] = [];
  readonly fetchedCalendarParts: { path: string; uid: number }[] = [];
  readonly streamedMessages: { path: string; uid: number }[] = [];
  readonly flagScans: { path: string; uids: number[] | null }[] = [];
  readonly labelWrites: LabelWrite[] = [];
  readonly statusCalls: string[] = [];
  readonly uidListings: string[] = [];
  readonly uidSearches: UidRange[] = [];
  onUidSearch: ((range: UidRange) => void) | null = null;
  failFetchUid: number | null = null;
  interruptStreamAfter: number | null = null;
  afterNextList: (() => Promise<void>) | null = null;
  readonly listeners = new Set<(change: MailboxChange) => void>();
  connections = 0;
  openConnections = 0;
  failConnect: string | null = null;
  failOperations: string | null = null;
  failFlagWrites: string | null = null;
  failIdleStop: string | null = null;
  partialMoves = false;
  failSearchIn: string | null = null;
  failKeywordPurge: string | null = null;
  beforeNextFetch: ((path: string) => void) | null = null;
  beforeNextConnect: (() => Promise<void>) | null = null;
  afterMove: ((sourcePath: string) => void) | null = null;
  private modseq = 1n;

  constructor(options: FakeMailServerOptions = {}) {
    this.password = options.password ?? 'secret';
    this.condstore = options.condstore ?? true;
    this.uidplus = options.uidplus ?? true;
    this.gmail = options.gmail ?? false;
  }

  addMailbox(path: string, role: MailboxRole, uidValidity = 1): FakeMailbox {
    const mailbox: FakeMailbox = {
      path,
      name: path.split('/').pop() ?? path,
      role,
      subscribed: true,
      uidValidity,
      uidNext: 1,
      highestModseq: 0n,
      messages: new Map(),
    };
    this.mailboxes.set(path, mailbox);
    return mailbox;
  }

  find(path: string): FakeMailbox | null {
    return this.mailboxes.get(path) ?? null;
  }

  findRecord(path: string, uid: number): RemoteMessageRecord | null {
    return this.find(path)?.messages.get(uid) ?? null;
  }

  mailbox(path: string): FakeMailbox {
    return present(this.find(path));
  }

  record(path: string, uid: number): RemoteMessageRecord {
    return present(this.findRecord(path, uid));
  }

  deliver(path: string, source: Uint8Array, options: DeliveryOptions = {}): number {
    return present(this.tryDeliver(path, source, options));
  }

  tryDeliver(path: string, source: Uint8Array, options: DeliveryOptions = {}): number | null {
    const mailbox = this.find(path);
    if (mailbox === null) {
      return null;
    }
    const uid = mailbox.uidNext;
    mailbox.uidNext += 1;
    mailbox.messages.set(uid, {
      uid,
      source: new Uint8Array(source),
      flags: { ...NO_FLAGS, ...options.flags },
      keywords: [...(options.keywords ?? [])],
      labels: this.gmail ? [...(options.labels ?? [])] : null,
      emailId: options.emailId ?? (this.gmail ? `gm-${String(this.modseq)}` : null),
      internalDate: options.internalDate ?? DEFAULT_INTERNAL_DATE,
      modseq: this.nextModseq(mailbox),
    });
    this.notify({ type: 'exists', mailboxPath: path, count: mailbox.messages.size });
    return uid;
  }

  updateFlags(path: string, uid: number, flags: Partial<MessageFlags>): boolean {
    const record = this.findRecord(path, uid);
    if (record === null) {
      return false;
    }
    record.flags = { ...record.flags, ...flags };
    record.modseq = this.nextModseq(this.mailbox(path));
    this.notify({ type: 'flags', mailboxPath: path, uid });
    return true;
  }

  updateKeywords(path: string, uid: number, keywords: readonly string[]): boolean {
    const record = this.findRecord(path, uid);
    if (record === null) {
      return false;
    }
    record.keywords = [...keywords];
    record.modseq = this.nextModseq(this.mailbox(path));
    this.notify({ type: 'flags', mailboxPath: path, uid });
    return true;
  }

  updateLabels(path: string, uid: number, labels: readonly string[]): boolean {
    const record = this.findRecord(path, uid);
    if (record === null) {
      return false;
    }
    record.labels = [...labels];
    record.modseq = this.nextModseq(this.mailbox(path));
    this.notify({ type: 'flags', mailboxPath: path, uid });
    return true;
  }

  expunge(path: string, uid: number): void {
    const mailbox = this.find(path);
    if (mailbox?.messages.delete(uid) === true) {
      this.nextModseq(mailbox);
    }
    this.notify({ type: 'expunge', mailboxPath: path, uid });
  }

  resetUidValidity(path: string): void {
    const mailbox = this.mailbox(path);
    const records = [...mailbox.messages.values()];
    mailbox.messages.clear();
    mailbox.uidValidity += 1;
    mailbox.uidNext = 1;
    records.forEach((record) => {
      const uid = mailbox.uidNext;
      mailbox.uidNext += 1;
      mailbox.messages.set(uid, { ...record, uid });
    });
  }

  removeMailbox(path: string): void {
    this.mailboxes.delete(path);
  }

  highestModseq(mailbox: FakeMailbox): bigint {
    return mailbox.highestModseq;
  }

  private nextModseq(mailbox: FakeMailbox): bigint {
    this.modseq += 1n;
    mailbox.highestModseq = this.modseq;
    return this.modseq;
  }

  private notify(change: MailboxChange): void {
    this.listeners.forEach((listener) => {
      listener(change);
    });
  }
}
