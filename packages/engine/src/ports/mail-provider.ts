import type {
  AppendResult,
  Disposer,
  FlagMutation,
  LabelMutation,
  MailboxChange,
  MoveResult,
  RawMessage,
  RemoteEmailId,
  RemoteFlagChange,
  RemoteMailbox,
  RemoteMailboxStatus,
  RemoteMessageSummary,
  RemoteSyncCursor,
  RemoteTextSearch,
  RemoteTextSearchResult,
  RemoteThreadHeaders,
} from '../model/remote-mail';
import type { MessageFlags } from '@relay/shared/domain';

export interface UidRange {
  readonly from: number;
  readonly to: number;
}

export type UidScope =
  | { readonly range?: UidRange; readonly among?: never; readonly newest?: never }
  | { readonly among: readonly number[]; readonly range?: never; readonly newest?: never }
  | { readonly newest: number; readonly range?: never; readonly among?: never };

export type UidListOptions = { readonly fresh?: boolean } & UidScope;

export type RelatedSearchMatch = 'all' | 'message-id';

export interface RelatedSearchOptions {
  readonly match?: RelatedSearchMatch;
  readonly since?: Date;
}

export interface MailProvider {
  connect(): Promise<void>;
  listMailboxes(): Promise<RemoteMailbox[]>;
  createMailbox(name: string, parentPath?: string): Promise<RemoteMailbox>;
  renameMailbox(path: string, newPath: string): Promise<RemoteMailbox>;
  deleteMailbox(path: string): Promise<void>;
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
  fetchSummaries(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): Promise<RemoteMessageSummary[]>;
  fetchEmailIds(
    mailboxPath: string,
    uidValidity: number,
    uids: readonly number[],
  ): Promise<RemoteEmailId[]>;
  fetchFlagChanges(
    mailboxPath: string,
    sinceModseq: string,
    uids?: readonly number[],
  ): AsyncIterable<RemoteFlagChange>;
  listUids(mailboxPath: string, options?: UidListOptions): Promise<number[]>;
  searchRelated(
    mailboxPath: string,
    uidValidity: number,
    messageIds: readonly string[],
    options?: RelatedSearchOptions,
  ): Promise<number[]>;
  searchText(
    mailboxPath: string,
    uidValidity: number,
    query: RemoteTextSearch,
  ): Promise<RemoteTextSearchResult>;
  fetchMessage(mailboxPath: string, uid: number): Promise<RawMessage | null>;
  fetchCalendarParts(mailboxPath: string, uid: number): Promise<string[] | null>;
  setFlags(mailboxPath: string, uids: readonly number[], mutation: FlagMutation): Promise<void>;
  setKeywords(
    mailboxPath: string,
    uids: readonly number[],
    mutation: { readonly add: readonly string[]; readonly remove: readonly string[] },
  ): Promise<void>;
  purgeKeyword(mailboxPath: string, keyword: string): Promise<void>;
  setLabels(mailboxPath: string, uids: readonly number[], mutation: LabelMutation): Promise<void>;
  move(mailboxPath: string, uids: readonly number[], targetPath: string): Promise<MoveResult>;
  append(
    mailboxPath: string,
    source: Uint8Array,
    flags: Partial<MessageFlags>,
  ): Promise<AppendResult>;
  idle(mailboxPath: string, onChange: (change: MailboxChange) => void): Promise<Disposer>;
  close(): Promise<void>;
}
