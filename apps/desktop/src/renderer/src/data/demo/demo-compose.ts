import type { DraftContent, Message, SendBody, SendResponse } from '@relay/shared';
import { MailClientError } from '../errors';
import { removeDraft } from './demo-drafts';
import type { DemoState } from './demo-state';
import { demoIds } from './seed/ids';

let sequence = 0;
const nextKey = (prefix: string): string => {
  sequence += 1;
  return `${prefix}-${String(Date.now())}-${String(sequence)}`;
};

const contentOf = (state: DemoState, body: SendBody): DraftContent => {
  if (body.source === 'inline') {
    return body.draft;
  }
  const draft = state.drafts.find((item) => item.id === body.draftId);
  if (draft === undefined) {
    throw new MailClientError({ code: 'not_found', message: 'Koncept neexistuje' });
  }
  return draft;
};

const outgoingMessage = (
  state: DemoState,
  content: DraftContent,
  threadKey: string,
  now: string,
): Message => {
  const account = state.accounts.find((item) => item.id === content.accountId);
  return {
    id: demoIds.message(nextKey('out')),
    threadId: demoIds.thread(threadKey),
    accountId: content.accountId,
    mailboxId: demoIds.mailbox('sent'),
    uid: 0,
    messageIdHeader: `<${nextKey('msg')}@demo.relay>`,
    inReplyTo: null,
    references: [],
    from: { name: account?.senderName ?? 'Ján Adamec', email: account?.email ?? 'ja@relay.local' },
    to: content.to,
    cc: content.cc,
    bcc: content.bcc,
    replyTo: [],
    subject: content.subject,
    date: now,
    snippet: content.body.replace(/\s+/g, ' ').slice(0, 160),
    textBody: content.body,
    htmlBody: null,
    flags: { seen: true, flagged: false, answered: false },
    labelIds: [],
    attachments: content.attachments.map((attachment) => ({
      ...attachment,
      contentId: null,
      inline: false,
    })),
  };
};

const dropDraft = (state: DemoState, body: SendBody): void => {
  if (body.source !== 'draft') {
    return;
  }
  removeDraft(state, body.draftId);
};

export const demoSend = (state: DemoState, body: SendBody, now: Date): SendResponse => {
  const content = contentOf(state, body);
  if (body.scheduledAt !== undefined) {
    const draftId = body.source === 'draft' ? body.draftId : demoIds.draft(nextKey('d'));
    if (body.source === 'inline') {
      state.drafts.push({
        ...content,
        id: draftId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
    const scheduledSend = {
      id: demoIds.scheduled(nextKey('s')),
      userId: demoIds.user,
      accountId: content.accountId,
      draftId,
      scheduledAt: body.scheduledAt,
      status: 'pending' as const,
      error: null,
      sentAt: null,
      createdAt: now.toISOString(),
    };
    state.scheduled.push(scheduledSend);
    return { status: 'scheduled', scheduledSend };
  }
  dropDraft(state, body);
  const iso = now.toISOString();
  const existing =
    content.inReplyToThreadId === null ? undefined : state.threads.get(content.inReplyToThreadId);
  const threadKey = existing?.summary.id ?? nextKey('t');
  const message = outgoingMessage(state, content, threadKey, iso);
  if (existing !== undefined) {
    existing.messages.push(message);
    existing.summary = {
      ...existing.summary,
      lastMessageAt: iso,
      messageCount: existing.messages.length,
      snippet: message.snippet,
      hasDraft: state.drafts.some((item) => item.inReplyToThreadId === existing.summary.id),
    };
    return {
      status: 'sent',
      messageIdHeader: message.messageIdHeader,
      threadId: existing.summary.id,
    };
  }
  state.threads.set(threadKey, {
    summary: {
      id: demoIds.thread(threadKey),
      accountId: content.accountId,
      subject: content.subject,
      participants: content.to,
      lastMessageAt: iso,
      messageCount: 1,
      unread: false,
      snippet: message.snippet,
      aiOneLiner: null,
      jiraKey: null,
      jiraActor: null,
      splitIds: [],
      labelIds: [],
      state: 'done',
      remindAt: null,
      hasDraft: false,
    },
    messages: [message],
    aiSummary: null,
    checklist: [],
    replySuggestions: [],
  });
  return {
    status: 'sent',
    messageIdHeader: message.messageIdHeader,
    threadId: demoIds.thread(threadKey),
  };
};

export const newDraftKey = (): string => nextKey('d');
