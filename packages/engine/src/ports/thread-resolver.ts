import type { AccountId, ThreadId } from '@relay/shared/domain';
import type { ParsedMessage } from '../model/parsed-message';

export interface ThreadResolution {
  readonly threadId: ThreadId;
  readonly isNew: boolean;
}

export interface ThreadResolver {
  resolve(accountId: AccountId, message: ParsedMessage): Promise<ThreadResolution>;
}
