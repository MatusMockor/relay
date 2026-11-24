import type {
  AiJob,
  AiJobId,
  AiResultId,
  AutomationActivityId,
  AutomationId,
  CalendarEventId,
  MailAccount,
  Message,
  MessageId,
} from '@relay/shared/domain';
import { recordProviderOps } from '../../src/services/shared/provider-ops';
import { eventData } from './calendar-fixtures';
import { present } from './fixtures';
import { TEST_NOW, type TestEngine, USER_ID } from './test-engine';

export const RULE = 'aut_rule' as AutomationId;
export const LOSER_RULE = 'aut_loser_rule' as AutomationId;
export const LOSER_JOB = 'aij_loser' as AiJobId;
export const KEEPER_JOB = 'aij_keeper' as AiJobId;
export const DONE_JOB = 'aij_done' as AiJobId;
export const RESULT = 'air_loser' as AiResultId;
export const EVENT = 'cev_loser' as CalendarEventId;
export const ACTIVITY = 'aac_loser' as AutomationActivityId;
export const LATER = '2026-11-15T10:05:00.000Z';

const oneLiner = (id: AiJobId, message: Message, status: AiJob['status']): AiJob => ({
  id,
  userId: USER_ID,
  kind: 'oneLiner',
  status,
  runnerLocation: 'local',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId: message.threadId, sourceMessageId: message.id },
  output: null,
  error: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

const seedAi = async (engine: TestEngine, keeper: Message, loser: Message) => {
  const { aiJobs, aiResults } = engine.repositories;
  await aiJobs.create(oneLiner(KEEPER_JOB, keeper, 'queued'));
  await aiJobs.create(oneLiner(LOSER_JOB, loser, 'queued'));
  await aiJobs.create(oneLiner(DONE_JOB, loser, 'done'));
  await aiResults.save({
    id: RESULT,
    userId: USER_ID,
    threadId: loser.threadId,
    sourceMessageId: loser.id,
    runner: 'claude',
    output: { kind: 'automationDraft', threadId: loser.threadId, messageId: loser.id, body: 'Ok' },
    createdAt: TEST_NOW,
  });
};

const seedAutomation = async (
  engine: TestEngine,
  account: MailAccount,
  keeper: Message,
  loser: Message,
) => {
  const { automationRuns, automationActivity } = engine.repositories;
  const run = (automationId: AutomationId, messageId: MessageId) =>
    automationRuns.claim({ userId: USER_ID, automationId, messageId, createdAt: TEST_NOW });
  await run(RULE, keeper.id);
  await run(RULE, loser.id);
  await run(LOSER_RULE, loser.id);
  await automationActivity.append(
    {
      id: ACTIVITY,
      userId: USER_ID,
      automationId: RULE,
      accountId: account.id,
      threadId: loser.threadId,
      messageId: loser.id,
      source: 'live',
      from: loser.from,
      subject: loser.subject,
      actions: [
        {
          action: { type: 'archive' },
          outcome: 'ok',
          changed: [loser.id, keeper.id],
          previousState: null,
          origins: [{ messageId: loser.id, revision: 'rev-1' }],
          labelled: [loser.id],
          reminder: null,
          undo: null,
          reason: null,
        },
      ],
      createdAt: TEST_NOW,
      undoneAt: null,
    },
    { olderThan: '2020-01-01T00:00:00.000Z', keep: 100 },
  );
};

export const seedLoserReferences = async (
  engine: TestEngine,
  account: MailAccount,
  keeper: Message,
  loser: Message,
) => {
  await seedAi(engine, keeper, loser);
  await seedAutomation(engine, account, keeper, loser);
  await engine.repositories.calendarEvents.upsert({
    ...eventData(),
    id: EVENT,
    userId: USER_ID,
    source: { kind: 'invite', accountId: account.id },
    method: 'REQUEST',
    myPartstat: null,
    myEmail: null,
    messageId: loser.id,
    threadId: loser.threadId,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    revision: 1,
  });
  const [flagOp] = await recordProviderOps(
    engine.repositories.pendingWork,
    account.id,
    [{ messageId: loser.id, change: { kind: 'flag', flag: 'flagged', value: true } }],
    LATER,
  );
  const origin = await engine.repositories.pendingWork.put({
    accountId: account.id,
    kind: 'move-origin',
    ref: loser.id,
    payload: { messageId: loser.id, role: 'inbox', mailboxId: keeper.mailboxId, uid: keeper.uid },
    createdAt: TEST_NOW,
  });
  const draft = await engine.services.compose.createDraft(USER_ID, {
    accountId: account.id,
    to: [{ name: 'Peter Kral', email: 'peter@partner.test' }],
    cc: [],
    bcc: [],
    subject: `Re: ${loser.subject}`,
    body: 'Ďakujem',
    inReplyToThreadId: loser.threadId,
    inReplyToMessageId: loser.id,
    attachments: [],
  });
  return { flagOp: present(flagOp), origin, draft };
};
