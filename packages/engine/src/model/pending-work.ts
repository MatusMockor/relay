import type {
  AccountId,
  Address,
  CalendarAttendee,
  CopyMergeWork,
  DraftId,
  JiraKey,
  LabelId,
  MailboxId,
  MailboxRole,
  MessageId,
  MessagePlacement,
  ScheduledSendId,
  SplitId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { JiraClassification } from './jira';

export type ProviderChange =
  | { readonly kind: 'flag'; readonly flag: 'seen' | 'flagged'; readonly value: boolean }
  | { readonly kind: 'keyword'; readonly keyword: string; readonly value: boolean }
  | { readonly kind: 'label'; readonly label: string; readonly value: boolean }
  | { readonly kind: 'move'; readonly role: MailboxRole; readonly mailboxId?: MailboxId };

export interface ProviderOpWork {
  readonly messageId: MessageId;
  readonly change: ProviderChange;
  readonly source?: MessagePlacement;
}

export interface ThreadRefreshWork {
  readonly threadId: ThreadId;
  readonly addSplitIds: readonly SplitId[];
  readonly arrivedIn: readonly MailboxRole[];
  readonly jiraKey: JiraKey | null;
  readonly jiraActor: string | null;
  readonly expungedFromInbox: boolean;
  readonly quiet?: boolean;
}

export interface HeldOriginWork {
  readonly kind: 'trash-origin' | 'spam-origin';
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
}

export interface MoveOriginWork {
  readonly messageId: MessageId;
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
  readonly uid?: number;
  readonly labelId?: LabelId;
  readonly held?: readonly HeldOriginWork[];
  readonly markedDone?: boolean;
}

export interface MessageEffectsWork {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly publish: boolean;
  readonly arrival: boolean;
  readonly live?: boolean;
  readonly jira?: JiraClassification | null;
  readonly headers: readonly (readonly [string, readonly string[]])[];
}

export interface JiraEventWork {
  readonly threadId: ThreadId;
  readonly classification: JiraClassification;
  readonly title: string;
  readonly from?: Address | null;
  readonly headers?: readonly (readonly [string, readonly string[]])[];
}

export interface ScheduledSendSentWork {
  readonly scheduledSendId: ScheduledSendId;
  readonly userId: UserId;
  readonly draftId: DraftId;
  readonly draftUpdatedAt: string;
  readonly sentAt: string;
  readonly claimedAt: string;
}

export interface CalendarInviteWork {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly mailboxRole: MailboxRole;
  readonly parts: readonly string[];
  readonly publish: boolean;
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly failedAt: string | null;
  readonly lastError: string | null;
  readonly held?: boolean;
}

export interface CalendarReplyWork {
  readonly uid: string;
  readonly recurrenceId: string | null;
  readonly thisAndFuture?: boolean;
  readonly sequence: number;
  readonly dtstamp: string | null;
  readonly attendee: CalendarAttendee;
  readonly messageId: MessageId;
  readonly parkedAt: string;
}

export interface CalendarBackfillWork {
  readonly mailboxId: MailboxId;
  readonly afterUid: number;
}

export interface BodyRepairWork {
  readonly mailboxId: MailboxId;
  readonly afterUid: number;
}

export interface CalendarRebuildWork {
  readonly mailboxId: MailboxId;
  readonly afterUid: number;
  readonly uidValidity?: number | null;
  readonly failedReplays?: number;
}

export interface CalendarRebuildPartWork {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly mailboxRole: MailboxRole;
  readonly date: string;
  readonly parts: readonly string[];
}

export interface LabelRescanWork {
  readonly mailboxId: MailboxId;
}

export interface KeywordPurgeWork {
  readonly keyword: string;
  readonly mailboxIds: readonly MailboxId[];
  readonly purgedAt?: string;
}

export interface PendingWorkPayloads {
  readonly 'provider-op': ProviderOpWork;
  readonly 'thread-refresh': ThreadRefreshWork;
  readonly 'message-effects': MessageEffectsWork;
  readonly 'jira-event': JiraEventWork;
  readonly 'scheduled-send-sent': ScheduledSendSentWork;
  readonly 'calendar-invite': CalendarInviteWork;
  readonly 'calendar-reply': CalendarReplyWork;
  readonly 'calendar-backfill': CalendarBackfillWork;
  readonly 'calendar-rebuild': CalendarRebuildWork;
  readonly 'calendar-rebuild-part': CalendarRebuildPartWork;
  readonly 'trash-origin': MoveOriginWork;
  readonly 'spam-origin': MoveOriginWork;
  readonly 'move-origin': MoveOriginWork;
  readonly 'label-rescan': LabelRescanWork;
  readonly 'keyword-purge': KeywordPurgeWork;
  readonly 'body-repair': BodyRepairWork;
  readonly 'copy-merge': CopyMergeWork;
}

export type PendingWorkKind = keyof PendingWorkPayloads;

export interface PendingWorkKey<Kind extends PendingWorkKind = PendingWorkKind> {
  readonly accountId: AccountId;
  readonly kind: Kind;
  readonly ref: string;
}

export interface PendingWorkInput<Kind extends PendingWorkKind = PendingWorkKind>
  extends PendingWorkKey<Kind> {
  readonly payload: PendingWorkPayloads[Kind];
  readonly createdAt: string;
}

export interface PendingWork<Kind extends PendingWorkKind = PendingWorkKind>
  extends PendingWorkInput<Kind> {
  readonly revision: string;
}
