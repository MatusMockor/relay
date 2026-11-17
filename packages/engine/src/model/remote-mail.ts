import type { MailboxRole, MessageFlags } from '@relay/shared/domain';

export interface RemoteMailbox {
  readonly path: string;
  readonly name: string;
  readonly delimiter: string | null;
  readonly role: MailboxRole;
  readonly subscribed: boolean;
}

export interface RemoteMailboxStatus {
  readonly path: string;
  readonly uidValidity: number;
  readonly uidNext: number;
  readonly highestModseq: string | null;
  readonly messages: number;
  readonly unseen: number;
}

export interface RemoteSyncCursor {
  readonly uidValidity: number;
  readonly lastUid: number;
  readonly highestModseq: string | null;
}

export interface RawMessage {
  readonly mailboxPath: string;
  readonly uid: number;
  readonly flags: MessageFlags;
  readonly keywords: readonly string[];
  readonly internalDate: string;
  readonly size: number;
  readonly modseq: string | null;
  readonly source: Uint8Array;
}

export interface RemoteThreadHeaders {
  readonly uid: number;
  readonly internalDate: string;
  readonly date: string;
  readonly subject: string;
  readonly messageId: string | null;
  readonly inReplyTo: readonly string[];
  readonly references: readonly string[];
}

export interface RemoteFlagChange {
  readonly uid: number;
  readonly flags: MessageFlags;
  readonly keywords: readonly string[];
  readonly modseq: string | null;
}

export type MailFlag = keyof MessageFlags;

export interface FlagMutation {
  readonly add: readonly MailFlag[];
  readonly remove: readonly MailFlag[];
}

export interface MoveResult {
  readonly uidMap: ReadonlyMap<number, number>;
}

export interface AppendResult {
  readonly uid: number | null;
  readonly uidValidity: number | null;
}

export type MailboxChange =
  | { readonly type: 'exists'; readonly mailboxPath: string; readonly count: number }
  | { readonly type: 'expunge'; readonly mailboxPath: string; readonly uid: number | null }
  | { readonly type: 'flags'; readonly mailboxPath: string; readonly uid: number | null };

export type Disposer = () => Promise<void>;
