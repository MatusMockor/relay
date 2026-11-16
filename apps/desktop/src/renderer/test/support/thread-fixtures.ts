import type { z } from 'zod';
import {
  type AttachmentMetaSchema,
  MessageSchema,
  type ThreadDetail,
  ThreadDetailSchema,
  type ThreadSummary,
  ThreadSummarySchema,
} from '@relay/shared';

const STAMP = '2026-11-15T08:00:00.000Z';

export const serverThread = (subject: string, overrides: Partial<ThreadSummary> = {}) =>
  ThreadSummarySchema.parse({
    id: 'thread-1',
    accountId: 'acc-1',
    subject,
    participants: [{ name: 'Peter Novák', email: 'peter@firma.sk' }],
    lastMessageAt: STAMP,
    messageCount: 1,
    unread: false,
    snippet: 'Posielam faktúru',
    aiOneLiner: null,
    jiraKey: null,
    jiraActor: null,
    splitIds: [],
    labelIds: [],
    state: 'inbox',
    remindAt: null,
    hasDraft: false,
    ...overrides,
  });

export interface DetailExtras {
  readonly aiSummary?: string;
  readonly checklist?: readonly { id: string; text: string; done: boolean }[];
  readonly message?: Partial<z.input<typeof MessageSchema>>;
}

export const serverDetail = (
  thread: ThreadSummary,
  attachments: readonly z.input<typeof AttachmentMetaSchema>[],
  extras: DetailExtras = {},
): ThreadDetail =>
  ThreadDetailSchema.parse({
    thread,
    messages: [
      MessageSchema.parse({
        id: 'msg-1',
        threadId: thread.id,
        accountId: thread.accountId,
        mailboxId: 'mbx-1',
        uid: 1,
        messageIdHeader: '<msg-1@firma.sk>',
        inReplyTo: null,
        references: [],
        from: { name: 'Peter Novák', email: 'peter@firma.sk' },
        to: [{ name: 'Ján', email: 'jan@domov.sk' }],
        cc: [],
        bcc: [],
        replyTo: [],
        subject: thread.subject,
        date: STAMP,
        snippet: thread.snippet,
        textBody: 'Ahoj, posielam faktúru v prílohe.',
        htmlBody: null,
        flags: { seen: true, flagged: false, answered: false },
        labelIds: [],
        attachments,
        ...extras.message,
      }),
    ],
    aiSummary: extras.aiSummary ?? null,
    checklist: extras.checklist ?? [],
    replySuggestions: [],
  });
