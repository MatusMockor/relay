import {
  MessageSchema,
  TaskSchema,
  ThreadSummarySchema,
  type Message,
  type Task,
  type ThreadSummary,
} from '@relay/shared/domain';

export const USER_A = 'usr_a';
export const USER_B = 'usr_b';

export function thread(id: string, overrides: Record<string, unknown> = {}): ThreadSummary {
  return ThreadSummarySchema.parse({
    id,
    accountId: 'acc_1',
    subject: `Predmet ${id}`,
    participants: [{ name: 'Jana Nováková', email: 'jana@example.com' }],
    lastMessageAt: '2026-11-14T09:30:00+01:00',
    messageCount: 1,
    unread: true,
    snippet: 'Dobrý deň',
    aiOneLiner: null,
    jiraKey: null,
    splitIds: [],
    labelIds: [],
    state: 'inbox',
    remindAt: null,
    hasDraft: false,
    ...overrides,
  });
}

export function message(
  id: string,
  threadId: string,
  overrides: Record<string, unknown> = {},
): Message {
  return MessageSchema.parse({
    id,
    threadId,
    accountId: 'acc_1',
    mailboxId: 'mbx_1',
    uid: 1,
    messageIdHeader: null,
    inReplyTo: null,
    references: [],
    from: { name: 'Jana Nováková', email: 'jana@example.com' },
    to: [{ name: null, email: 'me@example.com' }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: 'Faktúra',
    date: '2026-11-14T09:30:00+01:00',
    snippet: 'Dobrý deň',
    textBody: 'Faktúra je v prílohe.',
    htmlBody: null,
    flags: { seen: false, flagged: false, answered: false },
    labelIds: [],
    attachments: [],
    ...overrides,
  });
}

export function task(id: string, userId: string, overrides: Record<string, unknown> = {}): Task {
  return TaskSchema.parse({
    id,
    userId,
    threadId: null,
    jiraKey: null,
    title: `Úloha ${id}`,
    aiWhat: null,
    state: 'open',
    source: 'manual',
    createdAt: '2026-11-14T09:30:00+01:00',
    updatedAt: '2026-11-14T09:30:00+01:00',
    ...overrides,
  });
}
