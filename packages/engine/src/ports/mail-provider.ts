import type {
  AppendResult,
  Disposer,
  FlagMutation,
  MailboxChange,
  MoveResult,
  RawMessage,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
  RemoteSyncCursor,
  RemoteThreadHeaders,
} from '../model/remote-mail';
import type { MessageFlags } from '@relay/shared/domain';

export interface MailProvider {
  connect(): Promise<void>;
  listMailboxes(): Promise<RemoteMailbox[]>;
  createMailbox(name: string): Promise<RemoteMailbox>;
  status(mailboxPath: string): Promise<RemoteMailboxStatus>;
  fetchSince(mailboxPath: string, cursor: RemoteSyncCursor | null): AsyncIterable<RawMessage>;
  fetchUids(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): AsyncIterable<RawMessage>;
  fetchThreadHeaders(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): Promise<RemoteThreadHeaders[]>;
  fetchFlagChanges(mailboxPath: string, sinceModseq: string): AsyncIterable<RemoteFlagChange>;
  listUids(mailboxPath: string): Promise<number[]>;
  fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null>;
  fetchCalendarParts(mailboxPath: string, uid: number): Promise<string[] | null>;
  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void>;
  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: { readonly add: readonly string[]; readonly remove: readonly string[] },
  ): Promise<void>;
  move(mailboxPath: string, uids: readonly number[], targetPath: string): Promise<MoveResult>;
  append(
    mailboxPath: string,
    source: Uint8Array,
    flags: Partial<MessageFlags>,
  ): Promise<AppendResult>;
  idle(mailboxPath: string, onChange: (change: MailboxChange) => void): Promise<Disposer>;
  close(): Promise<void>;
}
