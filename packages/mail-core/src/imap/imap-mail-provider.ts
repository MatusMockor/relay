import type {
  AppendResult,
  Disposer,
  FlagMutation,
  MailboxChange,
  MailProvider,
  MoveResult,
  RawMessage,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
  RemoteSyncCursor,
} from '@relay/engine';
import type { MessageFlags } from '@relay/shared/domain';
import { fetchFlagChanges } from './fetch-flag-changes';
import { fetchSince } from './fetch-since';
import { DEFAULT_IDLE_OPTIONS, IdleWatcher, type IdleWatcherOptions } from './idle-watcher';
import { createMailbox } from './create-mailbox';
import type { ImapClientFactory } from './imap-client-factory';
import { ImapConnection } from './imap-connection';
import { listMailboxes } from './list-mailboxes';
import { mailboxStatus } from './mailbox-status';
import { fetchMessage, listUids } from './message-reads';
import { appendMessage, moveMessages, setFlags, storeFlags } from './message-writes';

export interface ImapMailProviderOptions {
  readonly fetchBatchSize?: number;
  readonly idle?: IdleWatcherOptions;
}

const DEFAULT_FETCH_BATCH_SIZE = 50;

export class ImapMailProvider implements MailProvider {
  private readonly connection: ImapConnection;
  private readonly watchers = new Set<IdleWatcher>();

  constructor(
    private readonly factory: ImapClientFactory,
    private readonly options: ImapMailProviderOptions = {},
  ) {
    this.connection = new ImapConnection(factory);
  }

  async connect(): Promise<void> {
    await this.connection.run({ operation: 'connect', retryOnDisconnect: true }, () =>
      Promise.resolve(),
    );
  }

  listMailboxes(): Promise<RemoteMailbox[]> {
    return listMailboxes(this.connection);
  }

  createMailbox(name: string): Promise<RemoteMailbox> {
    return createMailbox(this.connection, name);
  }

  status(mailboxPath: string): Promise<RemoteMailboxStatus> {
    return mailboxStatus(this.connection, mailboxPath);
  }

  fetchSince(mailboxPath: string, cursor: RemoteSyncCursor | null): AsyncIterable<RawMessage> {
    const batchSize = this.options.fetchBatchSize ?? DEFAULT_FETCH_BATCH_SIZE;
    return fetchSince(this.connection, mailboxPath, cursor, batchSize);
  }

  async *fetchFlagChanges(
    mailboxPath: string,
    sinceModseq: string,
  ): AsyncIterable<RemoteFlagChange> {
    yield* await fetchFlagChanges(this.connection, mailboxPath, sinceModseq);
  }

  listUids(mailboxPath: string): Promise<number[]> {
    return listUids(this.connection, mailboxPath);
  }

  fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null> {
    return fetchMessage(this.connection, mailboxPath, uid);
  }

  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void> {
    return setFlags(this.connection, mailboxPath, uids, mutation);
  }

  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: { readonly add: readonly string[]; readonly remove: readonly string[] },
  ): Promise<void> {
    return storeFlags(this.connection, mailboxPath, uids, mutation);
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
    await watcher.start();
    this.watchers.add(watcher);
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
