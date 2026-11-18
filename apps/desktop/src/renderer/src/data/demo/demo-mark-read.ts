import type { MarkFolderReadBody, MarkFolderReadResponse, ThreadSummary } from '@relay/shared';
import type { ThreadReader } from '../MailClient';
import type { DemoMoves } from './demo-moves';
import { queryThreads } from './demo-query';
import type { DemoState } from './demo-state';

type DemoMarkReadMethods = Pick<ThreadReader, 'markFolderRead'>;

const markRead = (
  state: DemoState,
  moves: DemoMoves,
  upserted: (thread: ThreadSummary) => void,
  folder: MarkFolderReadBody,
): MarkFolderReadResponse => {
  const unread = queryThreads(state, { ...folder, limit: state.threads.size })
    .items.filter((thread) => thread.unread)
    .flatMap((thread) => state.threads.get(thread.id) ?? []);
  unread.forEach((record) => {
    upserted(moves.apply(record, { type: 'markRead' }));
  });
  return { count: unread.length };
};

export const createDemoMarkRead = (
  state: DemoState,
  moves: DemoMoves,
  upserted: (thread: ThreadSummary) => void,
): DemoMarkReadMethods => ({
  markFolderRead: (folder) => Promise.resolve(markRead(state, moves, upserted, folder)),
});
