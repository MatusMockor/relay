import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { queryKeys } from '../src/data/hooks/query-keys';
import { writeThreadToLists } from '../src/data/hooks/thread-cache';
import { threadListParams } from '../src/data/hooks/use-mail-queries';
import type { ThreadListParams } from '../src/data/MailClient';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const LABEL = demoIds.label('bulk-projekt');
const SPLIT = demoIds.split('bulk');

const listed = (params: ThreadListParams, thread: ThreadSummary, changed: ThreadSummary) => {
  const client = new QueryClient();
  const key = queryKeys.threadList(threadListParams(params));
  client.setQueryData<ThreadPage>(key, { items: [thread], nextCursor: null });
  writeThreadToLists(client, changed);
  return (client.getQueryData<ThreadPage>(key)?.items ?? []).map((item) => item.id);
};

const stays = (params: ThreadListParams, thread: ThreadSummary, changed: ThreadSummary) => {
  expect(listed(params, thread, changed)).toEqual([thread.id]);
};

const leaves = (params: ThreadListParams, thread: ThreadSummary, changed: ThreadSummary) => {
  expect(listed(params, thread, changed)).toEqual([]);
};

const thread = (patch: Partial<ThreadSummary> = {}): ThreadSummary => ({
  ...bulkThread(1, NOW),
  ...patch,
});

describe('live list membership after a thread update', () => {
  it('keeps an archived task thread in tasks when only its read flag changes', () => {
    const archived = thread({ state: 'done', unread: true });
    stays({ view: 'tasks' }, archived, { ...archived, unread: false });
  });

  it('drops threads that moved to trash or spam from every non-held view', () => {
    const views: ThreadListParams[] = [
      { view: 'tasks' },
      { view: 'sent' },
      { view: 'drafts' },
      { view: 'scheduled' },
      { view: 'mailbox', mailboxId: demoIds.mailbox('efa') },
      { view: 'inbox', everywhere: true, q: 'správa' },
    ];
    views.forEach((params) => {
      leaves(params, thread({ state: 'done' }), thread({ state: 'trash' }));
      leaves(params, thread({ state: 'done' }), thread({ state: 'spam' }));
      stays(params, thread({ state: 'inbox' }), thread({ state: 'done' }));
    });
  });

  it('follows the thread state in state based views', () => {
    leaves({ view: 'inbox' }, thread(), thread({ state: 'done' }));
    const completed = thread({ state: 'done', markedDone: true });
    const archived = thread({ state: 'done', markedDone: false });
    stays({ view: 'done' }, completed, { ...completed, unread: false });
    leaves({ view: 'done' }, completed, archived);
    leaves({ view: 'archive' }, archived, completed);
    leaves({ view: 'reminders' }, thread({ state: 'reminder' }), thread());
    leaves({ view: 'trash' }, thread({ state: 'trash' }), thread());
    stays({ view: 'inbox', q: 'správa' }, thread(), thread({ unread: false }));
  });

  it('follows the label, split, account and unread filters it can decide from the thread', () => {
    leaves({ view: 'label', labelId: LABEL }, thread({ labelIds: [LABEL] }), thread());
    leaves({ view: 'inbox', splitId: SPLIT }, thread({ splitIds: [SPLIT] }), thread());
    leaves({ view: 'inbox', unread: true }, thread({ unread: true }), thread({ unread: false }));
    leaves(
      { view: 'inbox', accountId: demoIds.account('efa') },
      thread(),
      thread({ accountId: demoIds.account('fl') }),
    );
    stays(
      { view: 'inbox', everywhere: true, labelId: LABEL },
      thread({ labelIds: [LABEL] }),
      thread({ state: 'done' }),
    );
  });
});
