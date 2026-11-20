import type { AccountCredentials, MessageFlags } from '@relay/shared/domain';
import {
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
  type RemoteMessageSummary,
  type RemoteSyncCursor,
  type RemoteTextSearch,
  type RemoteThreadHeaders,
  type UidListOptions,
} from '../../../src';
import { asyncItems, failingItems } from './async-items';
import { connectionFailure, takeConnectGate } from './fake-connection';
import {
  appendFakeRecord,
  createFakeMailbox,
  deleteFakeMailbox,
  purgeFakeKeyword,
  renameFakeMailbox,
} from './fake-mailbox-admin';
import {
  calendarHeaders,
  missing,
  scanFlagChanges,
  statusOf,
  toRaw,
  toRemote,
} from './fake-records';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import { recordsOf, recordsSince, streamRecords } from './fake-message-streams';
import { searchRelatedRecords } from './fake-related-search';
import { searchFakeText } from './fake-text-search';
import { recordUidSearch, summaryOf, uidsInRange } from './fake-summaries';
import { threadHeadersOf } from './fake-thread-headers';
import { uidValidityMismatch } from './fake-uid-validity';
import { type ChangeListener, watchFakeMailbox } from './fake-idle';
import {
  applyKeywords,
  type KeywordMutation,
  moveRecords,
  writeFlags,
  writeLabels,
} from './fake-writes';

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
    const gate = takeConnectGate(this.server);
    if (gate !== null) {
      return gate.then(() => this.connect());
    }
    const failure = connectionFailure(this.server, this.credentials);
    if (failure !== null) {
      return Promise.reject(failure);
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

  createMailbox(name: string, parentPath?: string): Promise<RemoteMailbox> {
    return this.guard((server) => createFakeMailbox(server, name, parentPath));
  }

  renameMailbox(path: string, newPath: string): Promise<RemoteMailbox> {
    return this.guard((server) => renameFakeMailbox(server, path, newPath));
  }

  deleteMailbox(path: string): Promise<void> {
    return this.guard((server) => deleteFakeMailbox(server, path));
  }

  purgeKeyword(path: string, keyword: string): Promise<void> {
    return this.guard((server) => purgeFakeKeyword(server, path, keyword));
  }

  status(mailboxPath: string): Promise<RemoteMailboxStatus> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      server.statusCalls.push(mailboxPath);
      return Promise.resolve(statusOf(server, mailbox));
    });
  }

  fetchSince(mailboxPath: string, cursor: RemoteSyncCursor | null): AsyncIterable<RawMessage> {
    const opened = this.openStream(mailboxPath, cursor?.uidValidity ?? null);
    if (opened instanceof Error) {
      return failingItems(opened);
    }
    return streamRecords(opened.server, mailboxPath, recordsSince(opened.mailbox, cursor));
  }

  fetchUids(path: string, uidValidity: number, uids: readonly number[]) {
    const opened = this.openStream(path, uidValidity);
    if (opened instanceof Error) {
      return failingItems<RawMessage>(opened);
    }
    return streamRecords(opened.server, path, recordsOf(opened.mailbox, uids));
  }

  fetchThreadHeaders(path: string, uidValidity: number, uids: readonly number[]) {
    return this.readRecords<RemoteThreadHeaders>(path, uidValidity, uids, threadHeadersOf);
  }

  fetchSummaries(path: string, uidValidity: number, uids: readonly number[]) {
    return this.readRecords<RemoteMessageSummary>(path, uidValidity, uids, summaryOf);
  }

  fetchFlagChanges(path: string, sinceModseq: string, uids?: readonly number[]) {
    const opened = this.streamMailbox(path, `Cannot fetch flags of ${path}`);
    if (opened instanceof Error) {
      return failingItems<RemoteFlagChange>(opened);
    }
    return asyncItems(scanFlagChanges(opened, path, sinceModseq, uids));
  }

  searchRelated(path: string, validity: number, ids: readonly string[]): Promise<number[]> {
    return this.withMailbox(path, (box, s) => searchRelatedRecords(s, box, validity, ids));
  }

  searchText(path: string, validity: number, query: RemoteTextSearch) {
    return this.withMailbox(path, (box, server) => searchFakeText(server, box, validity, query));
  }

  listUids(mailboxPath: string, options: UidListOptions = {}): Promise<number[]> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      server.uidListings.push(options.fresh === true ? `fresh:${mailboxPath}` : mailboxPath);
      recordUidSearch(server, options);
      return Promise.resolve(uidsInRange(mailbox.messages.keys(), options));
    });
  }

  async fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null> {
    const record = await this.fetchRecord(mailboxPath, uid, (server) => server.fetchedMessages);
    return record === null ? null : toRaw(mailboxPath, record);
  }

  async fetchCalendarParts(mailboxPath: string, uid: number): Promise<string[] | null> {
    const record = await this.fetchRecord(mailboxPath, uid, (s) => s.fetchedCalendarParts);
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
    return this.withMailbox(mailboxPath, (_mailbox, server) =>
      writeFlags(server, mailboxPath, uids, mutation),
    );
  }

  setKeywords(path: string, uids: readonly number[], mutation: KeywordMutation): Promise<void> {
    return this.withMailbox(path, (mailbox, server) => {
      applyKeywords(mailbox, server, uids, mutation);
      return Promise.resolve();
    });
  }

  setLabels(path: string, uids: readonly number[], mutation: KeywordMutation): Promise<void> {
    return this.withMailbox(path, (mailbox, server) =>
      writeLabels(mailbox, server, uids, mutation),
    );
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
    return this.withMailbox(mailboxPath, (mailbox, server) =>
      Promise.resolve(appendFakeRecord(server, mailbox, source, flags)),
    );
  }

  idle(mailboxPath: string, onChange: (change: MailboxChange) => void): Promise<Disposer> {
    return this.withMailbox(mailboxPath, (_mailbox, server) =>
      Promise.resolve(watchFakeMailbox(server, this.listeners, mailboxPath, onChange)),
    );
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

  private readRecords<Item>(
    path: string,
    uidValidity: number,
    uids: readonly number[],
    read: (record: RemoteMessageRecord) => Item,
  ): Promise<Item[]> {
    const opened = this.openStream(path, uidValidity);
    if (opened instanceof Error) {
      return Promise.reject(opened);
    }
    return Promise.resolve(recordsOf(opened.mailbox, uids).map(read));
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
    return uidValidityMismatch(opened.mailbox, uidValidity) ?? opened;
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
