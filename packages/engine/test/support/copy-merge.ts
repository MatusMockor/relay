import {
  type AccountId,
  FRESH_COPY_MERGE_WORK,
  type Message,
  type MessageId,
} from '@relay/shared/domain';
import { expect } from 'vitest';
import { MESSAGE_PENDING_KINDS, type PendingWork } from '../../src';
import { TEST_NOW, type TestEngine } from './test-engine';

const MESSAGE_KINDS: ReadonlySet<string> = new Set(MESSAGE_PENDING_KINDS);

export const enqueueCopyMerge = (engine: TestEngine, accountId: AccountId) =>
  engine.repositories.pendingWork.put({
    accountId,
    kind: 'copy-merge',
    ref: 'account',
    payload: FRESH_COPY_MERGE_WORK,
    createdAt: TEST_NOW,
  });

export const copyMergeRow = (engine: TestEngine, accountId: AccountId) =>
  engine.repositories.pendingWork.find({ accountId, kind: 'copy-merge', ref: 'account' });

export const storedMessages = (engine: TestEngine): Message[] => [
  ...engine.db.tables.messages.values(),
];

export const messagesWithEmailId = (engine: TestEngine, emailId: string): Message[] =>
  storedMessages(engine).filter((message) => message.emailId === emailId);

export const pendingOfKind = (engine: TestEngine, kind: string): PendingWork[] =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === kind);

const pendingOwner = (work: PendingWork): MessageId[] => {
  if (!MESSAGE_KINDS.has(work.kind)) {
    return [];
  }
  if (work.kind === 'jira-event') {
    return [work.ref as MessageId];
  }
  return 'messageId' in work.payload ? [work.payload.messageId] : [];
};

const referencedIds = (engine: TestEngine): MessageId[] => {
  const tables = engine.db.tables;
  return [
    ...[...tables.drafts.values()].flatMap(({ draft }) => draft.inReplyToMessageId ?? []),
    ...[...tables.calendarEvents.values()].flatMap((event) => event.messageId ?? []),
    ...tables.aiResults.flatMap((result) => [
      ...(result.sourceMessageId === null ? [] : [result.sourceMessageId]),
      ...(result.output.kind === 'automationDraft' ? [result.output.messageId] : []),
    ]),
    ...[...tables.aiJobs.values()].flatMap((job) => [
      ...('sourceMessageId' in job.input ? [job.input.sourceMessageId ?? null] : []),
      ...('messageId' in job.input ? [job.input.messageId] : []),
      ...(job.output?.kind === 'automationDraft' ? [job.output.messageId] : []),
    ]),
    ...tables.automationActivity.flatMap((record) => [
      record.messageId,
      ...record.actions.flatMap((action) => [
        ...action.changed,
        ...action.labelled,
        ...action.origins.map((origin) => origin.messageId),
      ]),
    ]),
    ...[...tables.automationRuns].map((key) => key.slice(key.indexOf(':') + 1) as MessageId),
    ...[...tables.pendingWork.values()].flatMap(pendingOwner),
  ].filter((id): id is MessageId => id !== null);
};

export const expectMergeInvariants = (engine: TestEngine): void => {
  const { messages, messageAliases } = engine.db.tables;
  storedMessages(engine).forEach((message) => {
    expect(message.placements.length).toBeGreaterThan(0);
  });
  [...messageAliases.values()].forEach((target) => {
    expect(messages.has(target)).toBe(true);
  });
  const dangling = referencedIds(engine).filter(
    (id) => !messages.has(id) && !messageAliases.has(id),
  );
  expect(dangling).toEqual([]);
};
