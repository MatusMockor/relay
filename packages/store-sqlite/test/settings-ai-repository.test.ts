import {
  type AiJob,
  AiJobIdSchema,
  type AiResult,
  AiResultIdSchema,
  DEFAULT_USER_SETTINGS,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { messageId, threadId, userId } from './support/fixtures';
import { createTestStore, type TestStore } from './support/test-database';

const buildResult = (overrides: Partial<AiResult> = {}): AiResult => ({
  id: AiResultIdSchema.parse('air-1'),
  userId: LOCAL_USER_ID,
  threadId: threadId('thr-1'),
  sourceMessageId: messageId('msg-1'),
  runner: 'claude',
  output: { kind: 'oneLiner', text: 'Klient posiela faktúru' },
  createdAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const buildJob = (overrides: Partial<AiJob> = {}): AiJob => ({
  id: AiJobIdSchema.parse('job-1'),
  userId: LOCAL_USER_ID,
  kind: 'summary',
  status: 'queued',
  runnerLocation: 'local',
  runner: 'codex',
  input: { kind: 'summary', threadId: threadId('thr-1') },
  output: null,
  error: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('SqliteSettingsRepository', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('returns null until settings are saved and then overwrites them', async () => {
    const { settings } = store.repositories;
    expect(await settings.find(LOCAL_USER_ID)).toBeNull();

    await settings.save(LOCAL_USER_ID, DEFAULT_USER_SETTINGS);
    const changed = { ...DEFAULT_USER_SETTINGS, density: 'compact' as const };
    await settings.save(LOCAL_USER_ID, changed);

    expect(await settings.find(LOCAL_USER_ID)).toEqual(changed);
    expect(await settings.find(userId('intruder'))).toBeNull();
  });

  it('saves only when the stored settings still match the expected value', async () => {
    const { settings } = store.repositories;
    const compact = { ...DEFAULT_USER_SETTINGS, density: 'compact' as const };
    const notified = { ...DEFAULT_USER_SETTINGS, notifications: 'urgent' as const };

    expect(await settings.saveIfUnchanged(LOCAL_USER_ID, null, compact)).toBe(true);
    expect(await settings.saveIfUnchanged(LOCAL_USER_ID, null, notified)).toBe(false);
    expect(await settings.saveIfUnchanged(LOCAL_USER_ID, DEFAULT_USER_SETTINGS, notified)).toBe(
      false,
    );
    expect(await settings.saveIfUnchanged(LOCAL_USER_ID, compact, notified)).toBe(true);
    expect(await settings.find(LOCAL_USER_ID)).toEqual(notified);
  });
});

describe('SqliteAiResultRepository and SqliteAiJobRepository', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('returns the latest result of a kind for a thread', async () => {
    const { aiResults } = store.repositories;
    await aiResults.save(buildResult());
    await aiResults.save(
      buildResult({
        id: AiResultIdSchema.parse('air-2'),
        output: { kind: 'oneLiner', text: 'Novší súhrn' },
        createdAt: '2026-11-11T10:00:00.000Z',
      }),
    );
    await aiResults.save(
      buildResult({
        id: AiResultIdSchema.parse('air-3'),
        output: {
          kind: 'summary',
          summary: 'Súhrn',
          checklist: [{ id: 'c1', text: 'Zaplatiť', done: false }],
        },
        createdAt: '2026-11-12T10:00:00.000Z',
      }),
    );

    expect((await aiResults.findLatest(LOCAL_USER_ID, threadId('thr-1'), 'oneLiner'))?.id).toBe(
      'air-2',
    );
    expect(
      (await aiResults.findLatest(LOCAL_USER_ID, threadId('thr-1'), 'summary'))?.output,
    ).toEqual({
      kind: 'summary',
      summary: 'Súhrn',
      checklist: [{ id: 'c1', text: 'Zaplatiť', done: false }],
    });
    expect(
      await aiResults.findLatest(userId('intruder'), threadId('thr-1'), 'oneLiner'),
    ).toBeNull();

    await aiResults.deleteByThread(threadId('thr-1'));
    expect(await aiResults.findLatest(LOCAL_USER_ID, threadId('thr-1'), 'oneLiner')).toBeNull();
  });

  it('creates jobs and applies partial updates', async () => {
    const { aiJobs } = store.repositories;
    await aiJobs.create(buildJob());

    const running = await aiJobs.update(buildJob().id, {
      status: 'running',
      updatedAt: '2026-11-10T10:00:01.000Z',
    });
    const done = await aiJobs.update(buildJob().id, {
      status: 'done',
      output: { kind: 'summary', summary: 'Hotovo', checklist: [] },
      updatedAt: '2026-11-10T10:00:05.000Z',
    });

    expect(running).toMatchObject({ status: 'running', output: null, error: null });
    expect(done).toMatchObject({ status: 'done', output: { kind: 'summary', summary: 'Hotovo' } });
    expect(await aiJobs.findById(LOCAL_USER_ID, buildJob().id)).toEqual(done);
    expect(await aiJobs.findById(userId('intruder'), buildJob().id)).toBeNull();
    expect(
      await aiJobs.update(AiJobIdSchema.parse('missing'), {
        status: 'error',
        updatedAt: '2026-11-10T10:00:05.000Z',
      }),
    ).toBeNull();
  });

  it('keeps the model a job was queued with', async () => {
    const { aiJobs } = store.repositories;
    await aiJobs.create(buildJob({ model: 'gpt-5.5' }));
    await aiJobs.create(buildJob({ id: AiJobIdSchema.parse('job-2') }));

    expect(await aiJobs.findById(LOCAL_USER_ID, buildJob().id)).toEqual(
      buildJob({ model: 'gpt-5.5' }),
    );
    expect(await aiJobs.findById(LOCAL_USER_ID, AiJobIdSchema.parse('job-2'))).toEqual(
      buildJob({ id: AiJobIdSchema.parse('job-2') }),
    );
  });
});
