import type { AiJob, AiJobStatus, MessageId } from '@relay/shared/domain';
import {
  type MessageIdRemap,
  remapActivityActions,
  remapAiJobInput,
  remapAiOutput,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const ACTIVE: readonly AiJobStatus[] = ['queued', 'running'];

const sourceOf = (job: AiJob): MessageId | null =>
  'sourceMessageId' in job.input ? (job.input.sourceMessageId ?? null) : null;

const remapRuns = (db: MemoryDatabase, remap: MessageIdRemap): void => {
  const runs = db.tables.automationRuns;
  [...runs].forEach((key) => {
    const split = key.indexOf(':');
    const automationId = key.slice(0, split);
    const messageId = key.slice(split + 1) as MessageId;
    const keeper = remap(messageId);
    if (keeper === messageId) {
      return;
    }
    runs.delete(key);
    runs.add(`${automationId}:${keeper}`);
  });
};

const remapScalars = (db: MemoryDatabase, remap: MessageIdRemap): void => {
  const { drafts, calendarEvents, aiResults, automationActivity } = db.tables;
  drafts.forEach((stored, id) => {
    const replyTo = stored.draft.inReplyToMessageId;
    if (replyTo !== null && remap(replyTo) !== replyTo) {
      drafts.set(id, { ...stored, draft: { ...stored.draft, inReplyToMessageId: remap(replyTo) } });
    }
  });
  calendarEvents.forEach((event, id) => {
    if (event.messageId !== null && remap(event.messageId) !== event.messageId) {
      calendarEvents.set(id, { ...event, messageId: remap(event.messageId) });
    }
  });
  aiResults.forEach((result, index) => {
    const source = result.sourceMessageId;
    aiResults[index] = {
      ...result,
      sourceMessageId: source === null ? null : remap(source),
      output: remapAiOutput(result.output, remap),
    };
  });
  automationActivity.forEach((record, index) => {
    automationActivity[index] = {
      ...record,
      messageId: remap(record.messageId),
      actions: remapActivityActions(record.actions, remap),
    };
  });
};

const activeSlot = (db: MemoryDatabase, job: AiJob, source: MessageId | null): string | null => {
  if (source === null || !ACTIVE.includes(job.status) || db.tables.unindexedAiJobs.has(job.id)) {
    return null;
  }
  const threadId = 'threadId' in job.input ? job.input.threadId : null;
  return JSON.stringify([job.userId, job.kind, threadId, source]);
};

const remapAiJobs = (db: MemoryDatabase, remap: MessageIdRemap): void => {
  const jobs = [...db.tables.aiJobs.values()];
  const moving = (job: AiJob): boolean => {
    const source = sourceOf(job);
    return source !== null && remap(source) !== source;
  };
  const taken = new Set(
    jobs.filter((job) => !moving(job)).map((job) => activeSlot(db, job, sourceOf(job))),
  );
  jobs.forEach((job) => {
    const source = sourceOf(job);
    const slot = activeSlot(db, job, source === null ? null : remap(source));
    if (moving(job) && slot !== null && taken.has(slot)) {
      return;
    }
    taken.add(slot);
    db.tables.aiJobs.set(job.id, {
      ...job,
      input: remapAiJobInput(job.input, remap),
      output: job.output === null ? null : remapAiOutput(job.output, remap),
    });
  });
};

export const remapReferencesIn = (db: MemoryDatabase, remap: MessageIdRemap): void => {
  remapRuns(db, remap);
  remapScalars(db, remap);
  remapAiJobs(db, remap);
};
