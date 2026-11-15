import type {
  AccountCredentials,
  MailAccount,
  MailboxRole,
  MessageFlags,
} from '@relay/shared/domain';
import type {
  AppendResult,
  Disposer,
  FlagMutation,
  MailboxChange,
  MailProvider,
  MailProviderFactory,
  MoveResult,
  RawMessage,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
  RemoteSyncCursor,
} from '../../../src';
import { asyncItems, failingItems } from './async-items';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';

const toRaw = (path: string, record: RemoteMessageRecord): RawMessage => ({
  mailboxPath: path,
  uid: record.uid,
  flags: { ...record.flags },
  keywords: [...record.keywords],
  internalDate: record.internalDate,
  size: record.source.byteLength,
  modseq: record.modseq.toString(),
  source: record.source,
});

const CREATED_ROLES: Readonly<Record<string, MailboxRole>> = {
  Archive: 'archive',
  Sent: 'sent',
  Trash: 'trash',
  Drafts: 'drafts',
};

const toRemote = (mailbox: FakeMailbox): RemoteMailbox => ({
  path: mailbox.path,
  name: mailbox.name,
  delimiter: '/',
  role: mailbox.role,
  subscribed: true,
});

const missing = (what: string): Promise<never> =>
  Promise.reject(new Error(`${what} does not exist`));

type ChangeListener = (change: MailboxChange) => void;

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
        toRemote(existing ?? server.addMailbox(name, CREATED_ROLES[name] ?? 'custom')),
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
    const mailbox = this.streamMailbox(mailboxPath, `Cannot fetch ${mailboxPath}`);
    if (mailbox instanceof Error) {
      return failingItems(mailbox);
    }
    const records = [...mailbox.messages.values()]
      .filter((record) => record.uid > (cursor?.lastUid ?? 0))
      .sort((a, b) => a.uid - b.uid);
    return asyncItems(records.map((record) => toRaw(mailboxPath, record)));
  }

  fetchFlagChanges(mailboxPath: string, sinceModseq: string): AsyncIterable<RemoteFlagChange> {
    const mailbox = this.streamMailbox(mailboxPath, `Cannot fetch flags of ${mailboxPath}`);
    if (mailbox instanceof Error) {
      return failingItems(mailbox);
    }
    const since = BigInt(sinceModseq);
    return asyncItems(
      [...mailbox.messages.values()]
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

  fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null> {
    return this.withMailbox(mailboxPath, (mailbox) => {
      const record = mailbox.messages.get(uid);
      return Promise.resolve(record === undefined ? null : toRaw(mailboxPath, record));
    });
  }

  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void> {
    return this.withMailbox(mailboxPath, (_mailbox, server) => {
      const flags: Partial<MessageFlags> = {};
      mutation.add.forEach((flag) => (flags[flag] = true));
      mutation.remove.forEach((flag) => (flags[flag] = false));
      const applied = uids.every((uid) => server.updateFlags(mailboxPath, uid, flags));
      return applied ? Promise.resolve() : missing('A message');
    });
  }

  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: { readonly add: readonly string[]; readonly remove: readonly string[] },
  ): Promise<void> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      const applied = uids.every((uid) => {
        const current = mailbox.messages.get(uid)?.keywords ?? [];
        const next = [...new Set([...current, ...mutation.add])].filter(
          (keyword) => !mutation.remove.includes(keyword),
        );
        return server.updateKeywords(mailboxPath, uid, next);
      });
      return applied ? Promise.resolve() : missing('A message');
    });
  }

  move(mailboxPath: string, uids: readonly number[], targetPath: string): Promise<MoveResult> {
    return this.withMailbox(mailboxPath, (mailbox, server) => {
      if (server.find(targetPath) === null) {
        return missing(`Mailbox ${targetPath}`);
      }
      const uidMap = new Map<number, number>();
      uids.forEach((uid) => {
        const record = mailbox.messages.get(uid);
        const newUid =
          record === undefined ? null : server.tryDeliver(targetPath, record.source, record);
        if (newUid !== null) {
          server.expunge(mailboxPath, uid);
          uidMap.set(uid, newUid);
        }
      });
      return Promise.resolve({ uidMap: server.uidplus ? uidMap : new Map<number, number>() });
    });
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

  private streamMailbox(path: string, failure: string): FakeMailbox | Error {
    const server = this.connected ? this.server : null;
    const mailbox = server?.find(path) ?? null;
    if (server === null || mailbox === null) {
      return new Error(failure);
    }
    if (server.failOperations !== null) {
      return new Error(server.failOperations);
    }
    return mailbox;
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

export class FakeMailProviderFactory implements MailProviderFactory {
  readonly servers = new Map<string, FakeMailServer>();

  register(email: string, server: FakeMailServer): FakeMailServer {
    this.servers.set(email.toLowerCase(), server);
    return server;
  }

  create(account: MailAccount, credentials: AccountCredentials): MailProvider {
    return new FakeMailProvider(this.servers.get(account.email.toLowerCase()) ?? null, credentials);
  }
}
