import type { Split } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { inboxThreadsOf, senderInboxScans } from '../src/features/side/sender-inbox-scans';
import { serverThread } from './support/thread-fixtures';

const split = (key: string, flags: Pick<Split, 'exclusive' | 'hideTasks'>): Split => ({
  id: demoIds.split(key),
  userId: demoIds.user,
  accountId: null,
  name: key,
  order: 0,
  match: 'any',
  rules: [],
  exceptions: [],
  ...flags,
});

describe('sender inbox scans', () => {
  it('scans the inbox and every exclusive split inbox', () => {
    const scans = senderInboxScans([
      split('jira', { exclusive: true, hideTasks: false }),
      split('shared', { exclusive: false, hideTasks: true }),
    ]);

    expect(scans).toEqual([{ view: 'inbox' }, { view: 'inbox', splitId: demoIds.split('jira') }]);
  });

  it('also scans tasks when an exclusive split hides them from its inbox', () => {
    const scans = senderInboxScans([split('jira', { exclusive: true, hideTasks: true })]);

    expect(scans).toEqual([
      { view: 'inbox' },
      { view: 'inbox', splitId: demoIds.split('jira') },
      { view: 'tasks' },
    ]);
  });

  it('keeps each inbox thread once and leaves out tasks outside the inbox', () => {
    const inbox = serverThread('Faktúra');
    const threads = inboxThreadsOf([
      inbox,
      serverThread('Faktúra'),
      serverThread('Pripomienka', { id: demoIds.thread('2'), state: 'reminder' }),
      serverThread('Hotovo', { id: demoIds.thread('3'), state: 'done' }),
    ]);

    expect(threads.map((thread) => thread.id)).toEqual([inbox.id]);
  });
});
