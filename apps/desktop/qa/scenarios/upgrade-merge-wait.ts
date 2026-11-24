import { closeThread, metaMessageCount, openThread, threadFacts } from '../app/thread-view';
import type { AppSession } from './app-session';

export interface MergeObservation {
  readonly afterMs: number | null;
  readonly counts: readonly (number | null)[];
}

const MERGE_TIMEOUT_MS = 240_000;
const POLL_MS = 1_000;

const messagesOf = async (session: AppSession, subject: string): Promise<number | null> => {
  await openThread(session.page, subject);
  const count = metaMessageCount((await threadFacts(session.page)).meta);
  await closeThread(session.page);
  return count;
};

const noteChange = (session: AppSession, seen: (number | null)[], count: number | null) => {
  if (seen[seen.length - 1] === count) {
    return;
  }
  seen.push(count);
  session.step(`merge watch: thread shows ${String(count)} messages`);
};

export const waitForMergedThread = async (
  session: AppSession,
  subject: string,
  launchedAt: number,
): Promise<MergeObservation> => {
  const seen: (number | null)[] = [];
  const deadline = launchedAt + MERGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await messagesOf(session, subject);
    noteChange(session, seen, count);
    if (count === 1) {
      const afterMs = Date.now() - launchedAt;
      session.step(
        `merge: "${subject}" shows 1 mail ${String(afterMs)} ms after the new app launched`,
      );
      return { afterMs, counts: seen };
    }
    await session.page.waitForTimeout(POLL_MS);
  }
  session.step(`merge: "${subject}" still not 1 mail after ${String(MERGE_TIMEOUT_MS)} ms`);
  return { afterMs: null, counts: seen };
};
