import type { Message, ThreadPage, ThreadSummary } from '@relay/shared';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { DemoState } from '../../src/data/demo/demo-state';
import { buildDemoState } from '../../src/data/demo/seed/build-state';
import { demoIds } from '../../src/data/demo/seed/ids';
import type { MailClient, ThreadListParams } from '../../src/data/MailClient';

const MINUTE = 60_000;

export const bulkThread = (index: number, newest: Date): ThreadSummary => ({
  id: demoIds.thread(`bulk-${String(index).padStart(6, '0')}`),
  accountId: demoIds.account('efa'),
  subject: `Hromadná správa ${String(index)}`,
  participants: [{ name: `Odosielateľ ${String(index % 97)}`, email: 'odosielatel@firma.sk' }],
  lastMessageAt: new Date(newest.getTime() - index * 7 * MINUTE).toISOString(),
  messageCount: 1,
  unread: index % 4 === 0,
  snippet: 'Krátky úryvok hromadnej správy',
  aiOneLiner: null,
  jiraKey: null,
  jiraActor: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  remindAt: null,
  hasDraft: false,
});

const bulkMessage = (thread: ThreadSummary, index: number): Message => ({
  id: demoIds.message(`${thread.id}-m`),
  threadId: thread.id,
  accountId: thread.accountId,
  mailboxId: demoIds.mailbox('efa'),
  uid: 100_000 + index,
  placements: [{ mailboxId: demoIds.mailbox('efa'), uid: 100_000 + index }],
  messageIdHeader: `<${thread.id}@demo.relay>`,
  emailId: null,
  inReplyTo: null,
  references: [],
  from: thread.participants[0] ?? null,
  to: [],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: thread.subject,
  date: thread.lastMessageAt,
  snippet: thread.snippet,
  textBody: thread.snippet,
  htmlBody: null,
  flags: { seen: !thread.unread, flagged: false, answered: false },
  labelIds: [],
  attachments: [],
});

export const addDemoThread = (state: DemoState, thread: ThreadSummary, index = 0): void => {
  state.threads.set(thread.id, {
    summary: thread,
    messages: [bulkMessage(thread, index)],
    aiSummary: null,
    checklist: [],
    replySuggestions: [],
  });
};

export const bulkDemoState = (count: number, now: Date): DemoState => {
  const state = buildDemoState(now);
  const newest = new Date(now.getTime() - MINUTE);
  for (let index = 0; index < count; index += 1) {
    addDemoThread(state, bulkThread(index, newest), index);
  }
  return state;
};

export interface CountingClient {
  readonly client: MailClient;
  readonly listCalls: ThreadListParams[];
}

export const countingListClient = (state: DemoState, now: () => Date): CountingClient => {
  const base = createDemoMailClient({ aiStepMs: 0, state, now });
  const listCalls: ThreadListParams[] = [];
  return {
    listCalls,
    client: {
      ...base,
      listThreads: (params): Promise<ThreadPage> => {
        listCalls.push(params);
        return base.listThreads(params);
      },
    },
  };
};
