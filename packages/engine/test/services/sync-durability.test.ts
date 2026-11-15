import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { MemorySyncStateRepository } from '../support/memory/memory-small-repositories';
import { MemoryTaskRepository } from '../support/memory/memory-task-repository';
import { MemoryThreadRepository } from '../support/memory/memory-thread-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const JIRA = { name: 'Jira', email: 'jira@company.test' };

const memoryThreads = (engine: TestEngine): MemoryThreadRepository => {
  expect(engine.repositories.threads).toBeInstanceOf(MemoryThreadRepository);
  return engine.repositories.threads as MemoryThreadRepository;
};

const memoryTasks = (engine: TestEngine): MemoryTaskRepository => {
  expect(engine.repositories.tasks).toBeInstanceOf(MemoryTaskRepository);
  return engine.repositories.tasks as MemoryTaskRepository;
};

const inboxSubjects = async (engine: TestEngine): Promise<string[]> => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return page.items.map((thread) => thread.subject);
};

const queuedOneLiners = (engine: TestEngine) =>
  [...engine.db.tables.aiJobs.values()].filter((job) => job.kind === 'oneLiner');

describe('sync side effects survive failures', () => {
  it('retries a Jira task that could not be created on the next sync', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'j1', from: JIRA, subject: '[REL-4] Fix export' });
    memoryTasks(engine).failUpsert = 'database is locked';

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(engine.db.tables.tasks.size).toBe(0);
    memoryTasks(engine).failUpsert = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect([...engine.db.tables.tasks.values()].map((task) => task.jiraKey)).toEqual(['REL-4']);
  });

  it('refreshes threads after a flag change whose summary refresh failed', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.updateFlags('INBOX', 1, { seen: true });
    memoryThreads(engine).failUpsert = 'disk full';

    const failed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(failed.ok).toBe(false);
    memoryThreads(engine).failUpsert = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(present(page.items[0]).unread).toBe(false);
  });

  it('refreshes threads after an expunge whose summary refresh failed', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.expunge('INBOX', 1);
    memoryThreads(engine).failUpsert = 'disk full';

    await engine.services.sync.syncAccount(USER_ID, account.id);

    memoryThreads(engine).failUpsert = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await inboxSubjects(engine)).toEqual([]);
  });

  it('replays the effects of new mail stored by a batch that failed', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 5 } });
    const { account, server } = await seedAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    deliverMail(server, 'INBOX', { id: 'j2', from: JIRA, subject: '[REL-5] Deploy' });
    memoryThreads(engine).failUpsert = 'disk full';

    const failed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(failed.ok).toBe(false);
    expect(engine.db.tables.messages.size).toBe(1);
    memoryThreads(engine).failUpsert = null;
    engine.events.clear();
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await inboxSubjects(engine)).toEqual(['[REL-5] Deploy']);
    expect(engine.events.ofType('message.upserted')).toHaveLength(1);
    expect([...engine.db.tables.tasks.values()].map((task) => task.jiraKey)).toEqual(['REL-5']);
    expect(queuedOneLiners(engine)).toHaveLength(1);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('notifies inbox arrivals again when the sync failed before handling them', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 5 } });
    const { account, server } = await seedAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    const syncStates = engine.repositories.syncStates;
    expect(syncStates).toBeInstanceOf(MemorySyncStateRepository);
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Ponuka' });
    (syncStates as MemorySyncStateRepository).failSaveFor = archive.id;

    const failed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(failed.ok).toBe(false);
    expect(queuedOneLiners(engine)).toEqual([]);
    (syncStates as MemorySyncStateRepository).failSaveFor = null;
    engine.events.clear();
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(queuedOneLiners(engine)).toHaveLength(1);
    expect(engine.events.ofType('message.upserted')).toEqual([]);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });
});
