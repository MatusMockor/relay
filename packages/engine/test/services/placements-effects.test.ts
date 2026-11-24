import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { enableJiraTasks } from '../support/automations';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { moveRecords } from '../support/mail/fake-writes';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const JIRA_INVITE: MailSpec = {
  id: 'j1',
  from: { name: 'Jira', email: 'jira@company.atlassian.test' },
  subject: '[REL-12] Payment page crashes',
  date: '2026-11-14T08:00:00.000Z',
  headers: { 'X-Jira-Event': 'mention', 'X-Test-Calendar': 'invite-j1' },
};

const OFFER: MailSpec = { id: 'o1', subject: 'Ponuka', date: '2026-11-14T08:00:00.000Z' };

const effectsSetup = async (engine: TestEngine, options: { readonly uidplus?: boolean } = {}) => {
  await enableJiraTasks(engine);
  engine.calendar.parser.register('invite-j1', calendarOf('REQUEST', eventData()));
  const seeded = await seedGmailAccount(engine, options);
  seeded.server.addMailbox('Spam', 'spam');
  const sync = () => engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return { ...seeded, sync };
};

const onlyMessage = (engine: TestEngine): Message => {
  const messages = [...engine.db.tables.messages.values()];
  expect(messages).toHaveLength(1);
  return present(messages[0]);
};

const tasks = async (engine: TestEngine) =>
  (await engine.services.tasks.list(USER_ID, { limit: 50 })).items.map(({ state }) => state);

const queuedOneLiners = (engine: TestEngine) =>
  [...engine.db.tables.aiJobs.values()].filter(
    (job) => job.kind === 'oneLiner' && job.status === 'queued',
  );

const answerOneLiners = (engine: TestEngine): void => {
  engine.claude.respondWith(() => [
    { type: 'completed', output: { kind: 'oneLiner', text: 'Krátke zhrnutie' } },
  ]);
};

describe('message effects on placements', () => {
  it('queues the Jira event and the invite once when All Mail arrives in a later sync', async () => {
    const engine = createTestEngine();
    const { server, sync } = await effectsSetup(engine);
    deliverMail(server, 'INBOX', { ...JIRA_INVITE, allMail: false });
    await sync();
    const message = onlyMessage(engine);
    expect(await tasks(engine)).toEqual(['open']);
    expect(engine.calendar.parser.parsed).toEqual(['invite-j1']);
    expect(engine.db.tables.messageEffects.get(message.id)).toEqual({
      jira: TEST_NOW,
      invite: TEST_NOW,
    });
    const [task] = (await engine.services.tasks.list(USER_ID, { limit: 50 })).items;
    await engine.services.tasks.update(USER_ID, present(task).id, { state: 'done' });
    engine.clock.advance(60_000);
    deliverMail(server, 'Archive', JIRA_INVITE);

    await sync();

    expect(onlyMessage(engine).placements).toHaveLength(2);
    expect(await tasks(engine)).toEqual(['done']);
    expect(engine.calendar.parser.parsed).toEqual(['invite-j1']);
    expect(engine.db.tables.messageEffects.get(message.id)).toEqual({
      jira: TEST_NOW,
      invite: TEST_NOW,
    });
  });

  it('queues the effects of a spam message once when the web moves it to the inbox', async () => {
    const engine = createTestEngine();
    const { server, sync } = await effectsSetup(engine);
    deliverMail(server, 'Spam', JIRA_INVITE);
    await sync();
    const spam = onlyMessage(engine);
    expect(await tasks(engine)).toEqual([]);
    expect(engine.calendar.parser.parsed).toEqual([]);
    expect(engine.db.tables.messageEffects.get(spam.id)).toEqual({ jira: null, invite: null });

    await moveRecords(server.mailbox('Spam'), server, [1], 'INBOX');
    await sync();
    await sync();

    const message = onlyMessage(engine);
    expect(message.id).toBe(spam.id);
    expect(message.placements).toHaveLength(2);
    expect(await tasks(engine)).toEqual(['open']);
    expect(engine.calendar.parser.parsed).toEqual(['invite-j1']);
    expect(present(engine.db.tables.threads.get(message.threadId)).state).toBe('inbox');
  });

  it('treats a message put back into INBOX on the web as one new arrival', async () => {
    const engine = createTestEngine();
    answerOneLiners(engine);
    const { server, sync } = await effectsSetup(engine);
    deliverMail(server, 'INBOX', OFFER);
    await sync();
    expect(queuedOneLiners(engine)).toHaveLength(1);
    await engine.services.ai.processQueued();
    server.expunge('INBOX', 1);
    await sync();
    const archived = onlyMessage(engine);
    expect(present(engine.db.tables.threads.get(archived.threadId)).state).toBe('done');
    engine.clock.advance(60 * 60_000);

    expect(deliverMail(server, 'INBOX', OFFER)).toBe(2);
    await sync();
    await sync();

    expect(onlyMessage(engine).id).toBe(archived.id);
    expect(present(engine.db.tables.threads.get(archived.threadId)).state).toBe('inbox');
    expect(queuedOneLiners(engine)).toHaveLength(1);
  });

  it('adopts the pending INBOX placement of an undone message without an arrival', async () => {
    const engine = createTestEngine();
    answerOneLiners(engine);
    const { server, sync } = await effectsSetup(engine, { uidplus: false });
    deliverMail(server, 'INBOX', OFFER);
    await sync();
    await engine.services.ai.processQueued();
    const { threadId, id } = onlyMessage(engine);
    await engine.services.actions.apply(USER_ID, threadId, { type: 'done' });
    engine.clock.advance(60 * 60_000);

    await engine.services.actions.apply(USER_ID, threadId, { type: 'undone' });
    expect(
      onlyMessage(engine)
        .placements.map(({ uid }) => uid)
        .sort(),
    ).toEqual([0, 1]);
    await sync();

    const message = onlyMessage(engine);
    expect(message.id).toBe(id);
    expect(message.placements.map(({ uid }) => uid).sort()).toEqual([1, 2]);
    expect(present(engine.db.tables.threads.get(threadId)).state).toBe('inbox');
    expect(queuedOneLiners(engine)).toEqual([]);
  });
});
