import type {
  MailAccount,
  Mailbox,
  Message,
  MessageBodyState,
  Split,
  SplitId,
  UserId,
} from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { ParsedMessage } from '../../model/parsed-message';
import type { PlacedKind } from '../../model/placement-ingest';
import type { RemoteMessageMeta } from '../../model/remote-mail';
import type { SyncJournal } from './sync-journal';

export interface IngestTarget {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly mailbox: Mailbox;
  readonly splits: readonly Split[];
  readonly journal: SyncJournal | null;
  readonly publish: boolean;
  readonly live: boolean;
  readonly holdCalendar: boolean;
  readonly history?: boolean;
}

export interface FetchedMessage {
  readonly remote: RemoteMessageMeta;
  readonly source: Uint8Array | null;
  readonly bodyState: MessageBodyState;
  readonly parse: () => Promise<ParsedMessage>;
}

export interface CreatedMessage {
  readonly message: Message;
  readonly parsed: ParsedMessage;
  readonly jira: JiraClassification | null;
  readonly splitIds: readonly SplitId[];
}

export type IngestOutcome =
  | { readonly kind: 'skipped'; readonly reason: string }
  | {
      readonly kind: 'existing';
      readonly message: Message;
      readonly changed: boolean;
      readonly placed: PlacedKind;
    }
  | ({ readonly kind: 'created' } & CreatedMessage);
