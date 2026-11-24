import type {
  AccountId,
  FolderView,
  LabelId,
  MailboxId,
  SplitId,
  ThreadSearchField,
} from '@relay/shared/domain';
import type { PageRequest } from './page';

export interface ThreadFolderQuery extends PageRequest {
  readonly view: FolderView;
  readonly accountId: AccountId | null;
  readonly splitId: SplitId | null;
  readonly labelId: LabelId | null;
  readonly mailboxId: MailboxId | null;
  readonly search: string | null;
  readonly searchField?: ThreadSearchField | null;
  readonly everywhere?: boolean;
  readonly hasAttachment?: boolean;
  readonly unread?: boolean;
}
