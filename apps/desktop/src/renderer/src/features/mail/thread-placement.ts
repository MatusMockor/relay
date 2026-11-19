import type { ThreadSummary } from '@relay/shared';
import { type AccountScope, type Folder, INBOX } from '../../state/folders';

export interface ThreadPlacement {
  readonly folder: Folder;
  readonly scope: AccountScope;
}

const folderOfThread = (thread: ThreadSummary): Folder => {
  const splitId = thread.state === 'inbox' ? thread.splitIds[0] : undefined;
  return splitId === undefined ? INBOX : { kind: 'inbox', splitId };
};

const scopeOfThread = (thread: ThreadSummary, current: AccountScope): AccountScope =>
  current === 'all' ? 'all' : thread.accountId;

export const placementOf = (
  thread: ThreadSummary | null,
  current: AccountScope,
): ThreadPlacement => {
  if (thread === null) {
    return { folder: INBOX, scope: current };
  }
  return { folder: folderOfThread(thread), scope: scopeOfThread(thread, current) };
};
