import type {
  AppendResult,
  Disposer,
  FlagMutation,
  LabelMutation,
  MailboxChange,
  MailProvider,
  MoveResult,
  RawMessage,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
  RemoteSyncCursor,
  RemoteThreadHeaders,
  UidListOptions,
} from '@relay/engine';
import type { MessageFlags } from '@relay/shared/domain';
import { fetchFlagChanges } from './fetch-flag-changes';
import { fetchSince } from './fetch-since';
import { fetchThreadHeaders } from './fetch-thread-headers';
import { fetchUids } from './fetch-uids';
import { DEFAULT_IDLE_OPTIONS, IdleWatcher, type IdleWatcherOptions } from './idle-watcher';
import { createMailbox } from './create-mailbox';
import { deleteMailbox } from './delete-mailbox';
import { setLabels } from './gmail-label-writes';
import type { ImapClientFactory } from './imap-client-factory';
import { ImapConnection } from './imap-connection';
import { listMailboxes } from './list-mailboxes';
import { mailboxStatus } from './mailbox-status';
import { renameMailbox } from './rename-mailbox';
import { fetchCalendarParts } from './calendar-part-reads';
import { fetchMessage, listUids } from './message-reads';
import { purgeKeyword, storeKeywords } from './keyword-writes';
import { appendMessage, moveMessages, setFlags } from './message-writes';
import { searchRelated } from './search-related';
import { requireBatchSize } from './uid-batches';

export interface ImapMailProviderOptions {
  readonly fetchBatchSize?: number;
  readonly idle?: IdleWatcherOptions;
}

const DEFAULT_FETCH_BATCH_SIZE = 50;

export class ImapMailProvider implements MailProvider {
  private readonly connection: ImapConnection;
  private readonly watchers = new Set<IdleWatcher>();
  private readonly fetchBatchSize: number;

  constructor(
    private readonly factory: ImapClientFactory,
    private readonly options: ImapMailProviderOptions = {},
  ) {
    this.connection = new ImapConnection(factory);
    this.fetchBatchSize = requireBatchSize(options.fetchBatchSize ?? DEFAULT_FETCH_BATCH_SIZE);
  }

  async connect(): Promise<void> {
    await this.connection.run({ operation: 'connect', retryOnDisconnect: true }, () =>
      Promise.resolve(),
    );
  }

  listMailboxes(): Promise<RemoteMailbox[]> {
    return listMailboxes(this.connection);
  }

  createMailbox(name: string, parentPath?: string): Promise<RemoteMailbox> {
    return createMailbox(this.connection, name, parentPath);
  }

  renameMailbox(path: string, newPath: string): Promise<RemoteMailbox> {
    return renameMailbox(this.connection, path, newPath);
  }

  deleteMailbox(path: string): Promise<void> {
    return deleteMailbox(this.connection, path);
  }

  status(mailboxPath: string): Promise<RemoteMailboxStatus> {
    return mailboxStatus(this.connection, mailboxPath);
  }

  fetchSince(mailboxPath: string, cursor: RemoteSyncCursor | null): AsyncIterable<RawMessage> {
    return fetchSince(this.connection, mailboxPath, cursor, this.fetchBatchSize);
  }

  fetchUids(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): AsyncIterable<RawMessage> {
    return fetchUids(this.connection, mailboxPath, uidValidity, uids, this.fetchBatchSize);
  }

  fetchThreadHeaders(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): Promise<RemoteThreadHeaders[]> {
    return fetchThreadHeaders(this.connection, mailboxPath, uidValidity, uids, this.fetchBatchSize);
  }

  async *fetchFlagChanges(
    mailboxPath: string,
    sinceModseq: string,
    uids?: readonly number[],
  ): AsyncIterable<RemoteFlagChange> {
    yield* await fetchFlagChanges(this.connection, mailboxPath, sinceModseq, uids);
  }

  listUids(mailboxPath: string, options?: UidListOptions): Promise<number[]> {
    return listUids(this.connection, mailboxPath, options);
  }

  searchRelated(
    mailboxPath: string,
    uidValidity: number,
    messageIds: readonly string[],
  ): Promise<number[]> {
    return searchRelated(this.connection, mailboxPath, uidValidity, messageIds);
  }

  fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null> {
    return fetchMessage(this.connection, mailboxPath, uid);
  }

  fetchCalendarParts(mailboxPath: string, uid: number): Promise<string[] | null> {
    return fetchCalendarParts(this.connection, mailboxPath, uid);
  }

  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void> {
    return setFlags(this.connection, mailboxPath, uids, mutation);
  }

  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: { readonly add: readonly string[]; readonly remove: readonly string[] },
  ): Promise<void> {
    return storeKeywords(this.connection, mailboxPath, uids, mutation);
  }

  purgeKeyword(mailboxPath: string, keyword: string): Promise<void> {
    return purgeKeyword(this.connection, mailboxPath, keyword);
  }

  setLabels(mailboxPath: string, uids: readonly number[], mutation: LabelMutation): Promise<void> {
    return setLabels(this.connection, mailboxPath, uids, mutation);
  }

  move(mailboxPath: string, uids: readonly number[], targetPath: string): Promise<MoveResult> {
    return moveMessages(this.connection, mailboxPath, uids, targetPath);
  }

  append(
    mailboxPath: string,
    source: Uint8Array,
    flags: Partial<MessageFlags>,
  ): Promise<AppendResult> {
    return appendMessage(this.connection, mailboxPath, source, flags);
  }

  async idle(mailboxPath: string, onChange: (change: MailboxChange) => void): Promise<Disposer> {
    const watcher = new IdleWatcher(
      this.factory,
      mailboxPath,
      onChange,
      this.options.idle ?? DEFAULT_IDLE_OPTIONS,
    );
    this.watchers.add(watcher);
    await watcher.start().catch(async (error: unknown) => {
      this.watchers.delete(watcher);
      await watcher.dispose();
      throw error;
    });
    return async () => {
      this.watchers.delete(watcher);
      await watcher.dispose();
    };
  }

  async close(): Promise<void> {
    const watchers = [...this.watchers];
    this.watchers.clear();
    await Promise.all([...watchers.map((watcher) => watcher.dispose()), this.connection.close()]);
  }
}
