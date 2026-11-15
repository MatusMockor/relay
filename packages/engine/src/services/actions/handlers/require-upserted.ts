import type { ThreadId, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { ThreadRefreshOutcome } from '../../shared/thread-refresh';

export const requireUpserted = (
  outcome: ThreadRefreshOutcome,
  threadId: ThreadId,
): ThreadSummary => {
  if (outcome.kind === 'removed') {
    throw new NotFoundError('Thread', threadId);
  }
  return outcome.thread;
};
