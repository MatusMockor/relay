import type { AccountCredentials, MessageFlags } from '@relay/shared/domain';
import {
  UidValidityChangedError,
  type AppendResult,
  type Disposer,
  type FlagMutation,
  type MailboxChange,
  type MailProvider,
  type MoveResult,
  type RawMessage,
  type RemoteFlagChange,
  type RemoteMailbox,
  type RemoteMailboxStatus,
  type RemoteSyncCursor,
  type RemoteThreadHeaders,
} from '../../../src';
import { asyncItems, failingItems } from './async-items';
import { calendarHeaders, CREATED_ROLES, missing, toRaw, toRemote } from './fake-records';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import { recordsOf, recordsSince, streamRecords } from './fake-message-streams';
import { threadHeadersOf } from './fake-thread-headers';
import { applyKeywords, type KeywordMutation, moveRecords } from './fake-writes';

type ChangeListener = (change: MailboxChange) => void;

interface OpenedMailbox {
  readonly mailbox: FakeMailbox;
  readonly server: FakeMailServer;
}

export class FakeMailProvider implements MailProvider {
  private connected = false;
  private readonly listeners = new Set<ChangeListener>();

  constructor(
    private readonly server: FakeMailServer | null,
    private readonly credentials: AccountCredentials,
  ) {}

  connect(): Promise<void> {
    if (this.server === null) {
      return Promise.reject(new Error('Unknown host'));
    }
    if (this.connected) {
      return Promise.resolve();
    }
    this.server.connections += 1;
    if (this.server.failConnect !== null) {
      return Promise.reject(new Error(this.server.failConnect));
    }
    if (
      this.credentials.kind === 'password' &&
      this.credentials.password !== this.server.password
    ) {
      return Promise.reject(new Error('Authentication failed'));
    }
    this.connected = true;
    this.server.openConnections += 1;
    return Promise.resolve();
  }

  listMailboxes(): Promise<RemoteMailbox[]> {
    return this.guard(async (server) => {
      const listed = [...server.mailboxes.values()].map(toRemote);
      const hook = server.afterNextList;
      server.afterNextList = null;
      await hook?.();
      return listed;
    });
  }

  createMailbox(name: string): Promise<RemoteMailbox> {
    return this.guard((server) => {
      server.createdMailboxes.push(name);
      const existing = server.find(name);
      return Promise.resolve(
        toRemote(existing ?? server.addMailbox(name, CREATED_ROLES.get(name) ?? 'custom')),
      );
    });
  }

  status(mailboxPath: string): Promise<RemoteMailboxStatus> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      const records = [...mailbox.messages.values()];
      return Promise.resolve({
        path: mailboxPath,
        uidValidity: mailbox.uidValidity,
        uidNext: mailbox.uidNext,
        highestModseq: server.condstore ? server.highestModseq(mailbox).toString() : null,
        messages: records.length,
        unseen: records.filter((record) => !record.flags.seen).length,
      });
    });
  }

  fetchSince(mailboxPath: string, cursor: RemoteSyncCursor | null): AsyncIterable<RawMessage> {
    const opened = this.openStream(mailboxPath, cursor?.uidValidity ?? null);
    if (opened instanceof Error) {
      return failingItems(opened);
    }
    return streamRecords(opened.server, mailboxPath, recordsSince(opened.mailbox, cursor));
  }

  fetchUids(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): AsyncIterable<RawMessage> {
    const opened = this.openStream(mailboxPath, uidValidity);
    if (opened instanceof Error) {
      return failingItems(opened);
    }
    return streamRecords(opened.server, mailboxPath, recordsOf(opened.mailbox, uids));
  }

  fetchThreadHeaders(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): Promise<RemoteThreadHeaders[]> {
    const opened = this.openStream(mailboxPath, uidValidity);
    if (opened instanceof Error) {
      return Promise.reject(opened);
    }
    return Promise.resolve(recordsOf(opened.mailbox, uids).map(threadHeadersOf));
  }

  fetchFlagChanges(mailboxPath: string, sinceModseq: string): AsyncIterable<RemoteFlagChange> {
    const opened = this.streamMailbox(mailboxPath, `Cannot fetch flags of ${mailboxPath}`);
    if (opened instanceof Error) {
      return failingItems(opened);
    }
    const since = BigInt(sinceModseq);
    return asyncItems(
      [...opened.mailbox.messages.values()]
        .filter((record) => record.modseq > since)
        .map((record) => ({
          uid: record.uid,
          flags: { ...record.flags },
          keywords: [...record.keywords],
          modseq: record.modseq.toString(),
        })),
    );
  }

  listUids(mailboxPath: string): Promise<number[]> {
    return this.withMailbox(mailboxPath, (mailbox) =>
      Promise.resolve([...mailbox.messages.keys()].sort((a, b) => a - b)),
    );
  }

  async fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null> {
    const record = await this.fetchRecord(mailboxPath, uid, (server) => server.fetchedMessages);
    return record === null ? null : toRaw(mailboxPath, record);
  }

  async fetchCalendarParts(mailboxPath: string, uid: number): Promise<string[] | null> {
    const log = (server: FakeMailServer) => server.fetchedCalendarParts;
    const record = await this.fetchRecord(mailboxPath, uid, log);
    return record === null ? null : calendarHeaders(record.source);
  }

  private fetchRecord(
    path: string,
    uid: number,
    log: (server: FakeMailServer) => { path: string; uid: number }[],
  ): Promise<RemoteMessageRecord | null> {
    return this.withMailbox(path, (mailbox, server) => {
      log(server).push({ path, uid });
      if (server.failFetchUid === uid) {
        return Promise.reject(new Error('Connection reset'));
      }
      return Promise.resolve(mailbox.messages.get(uid) ?? null);
    });
  }

  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void> {
    return this.withMailbox(mailboxPath, (_mailbox, server) => {
      const flags: Partial<MessageFlags> = {};
      mutation.add.forEach((flag) => (flags[flag] = true));
      mutation.remove.forEach((flag) => (flags[flag] = false));
      uids.forEach((uid) => server.updateFlags(mailboxPath, uid, flags));
      return Promise.resolve();
    });
  }

  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: KeywordMutation,
  ): Promise<void> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      applyKeywords(mailbox, server, uids, mutation);
      return Promise.resolve();
    });
  }

  move(mailboxPath: string, uids: readonly number[], targetPath: string): Promise<MoveResult> {
    return this.withMailbox(mailboxPath, (mailbox, server) =>
      moveRecords(mailbox, server, uids, targetPath),
    );
  }

  append(
    mailboxPath: string,
    source: Uint8Array,
    flags: Partial<MessageFlags>,
  ): Promise<AppendResult> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      const uid = server.tryDeliver(mailboxPath, source, { flags });
      return Promise.resolve(
        server.uidplus
          ? { uid, uidValidity: mailbox.uidValidity }
          : { uid: null, uidValidity: null },
      );
    });
  }

  idle(mailboxPath: string, onChange: (change: MailboxChange) => void): Promise<Disposer> {
    return this.withMailbox(mailboxPath, (_mailbox, server) => {
      const listener: ChangeListener = (change) => {
        if (change.mailboxPath === mailboxPath) {
          onChange(change);
        }
      };
      server.listeners.add(listener);
      this.listeners.add(listener);
      return Promise.resolve(() => {
        if (server.failIdleStop !== null) {
          return Promise.reject(new Error(server.failIdleStop));
        }
        server.listeners.delete(listener);
        this.listeners.delete(listener);
        return Promise.resolve();
      });
    });
  }

  close(): Promise<void> {
    this.listeners.forEach((listener) => this.server?.listeners.delete(listener));
    this.listeners.clear();
    if (this.connected && this.server !== null) {
      this.server.openConnections -= 1;
    }
    this.connected = false;
    return Promise.resolve();
  }

  private openStream(path: string, uidValidity: number | null): OpenedMailbox | Error {
    const beforeFetch = this.server?.beforeNextFetch ?? null;
    if (this.server !== null) {
      this.server.beforeNextFetch = null;
    }
    beforeFetch?.(path);
    const opened = this.streamMailbox(path, `Cannot fetch ${path}`);
    if (opened instanceof Error) {
      return opened;
    }
    const actual = opened.mailbox.uidValidity;
    if (uidValidity !== null && uidValidity !== actual) {
      return new UidValidityChangedError(path, uidValidity, actual);
    }
    return opened;
  }

  private streamMailbox(path: string, failure: string): OpenedMailbox | Error {
    const server = this.connected ? this.server : null;
    const mailbox = server?.find(path) ?? null;
    if (server === null || mailbox === null) {
      return new Error(failure);
    }
    if (server.failOperations !== null) {
      return new Error(server.failOperations);
    }
    return { mailbox, server };
  }

  private withMailbox<Result>(
    path: string,
    operation: (mailbox: FakeMailbox, server: FakeMailServer) => Promise<Result>,
  ): Promise<Result> {
    return this.guard((server) => {
      const mailbox = server.find(path);
      return mailbox === null ? missing(`Mailbox ${path}`) : operation(mailbox, server);
    });
  }

  private guard<Result>(operation: (server: FakeMailServer) => Promise<Result>): Promise<Result> {
    if (!this.connected || this.server === null) {
      return Promise.reject(new Error('Not connected'));
    }
    if (this.server.failOperations !== null) {
      return Promise.reject(new Error(this.server.failOperations));
    }
    return operation(this.server);
  }
}
