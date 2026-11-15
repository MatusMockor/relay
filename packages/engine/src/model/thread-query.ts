import type { AccountId, FolderView, LabelId, SplitId } from '@relay/shared/domain';
import type { PageRequest } from './page';

export interface ThreadFolderQuery extends PageRequest {
  readonly view: FolderView;
  readonly accountId: AccountId | null;
  readonly splitId: SplitId | null;
  readonly labelId: LabelId | null;
  readonly search: string | null;
}
