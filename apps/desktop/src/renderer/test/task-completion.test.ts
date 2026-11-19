import type { ThreadAction } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import {
  type CompletionGateway,
  restoreAction,
  revertChange,
} from '../src/features/mail/task-completion';
import { serverThread } from './support/thread-fixtures';

const NOW = Date.parse('2026-11-19T10:00:00.000Z');
const LATER = '2026-11-19T10:00:01.000Z';
const EARLIER = '2026-11-19T09:59:59.000Z';

const reminded = (remindAt: string) => serverThread('Pripomienka', { state: 'reminder', remindAt });

const recordingGateway = (actions: ThreadAction[]): CompletionGateway => ({
  openTasks: () => Promise.resolve([]),
  setTaskState: () => Promise.resolve(null),
  applyThread: (action) => {
    actions.push(action);
    return Promise.resolve(null);
  },
  now: () => NOW,
});

describe('restoring a completed thread', () => {
  it('brings back a reminder that is still ahead', () => {
    expect(restoreAction(reminded(LATER), NOW)).toEqual({ type: 'remind', at: LATER });
  });

  it('returns a reminder that is already due to the inbox', () => {
    expect(restoreAction(reminded(EARLIER), NOW)).toEqual({ type: 'undone' });
    expect(restoreAction(reminded(new Date(NOW).toISOString()), NOW)).toEqual({ type: 'undone' });
  });

  it('returns an inbox thread to the inbox', () => {
    expect(restoreAction(serverThread('Inbox'), NOW)).toEqual({ type: 'undone' });
  });

  it('reads the time from the gateway when reverting', async () => {
    const actions: ThreadAction[] = [];
    const result = await revertChange(recordingGateway(actions), reminded(EARLIER), {
      closed: [],
      moved: true,
    });
    expect(actions).toEqual([{ type: 'undone' }]);
    expect(result).toEqual({ change: { closed: [], moved: false }, failure: null });
  });
});
