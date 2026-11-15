import { type AiJobId, DEFAULT_USER_SETTINGS, type ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createTestEngine, OTHER_USER_ID, TEST_NOW, USER_ID } from '../support/test-engine';

describe('SettingsService', () => {
  it('returns defaults and merges partial patches', async () => {
    const engine = createTestEngine();
    expect(await engine.services.settings.get(USER_ID)).toEqual(DEFAULT_USER_SETTINGS);

    const updated = await engine.services.settings.update(USER_ID, {
      density: 'compact',
      ai: { location: 'server', features: { summaries: false } },
    });

    expect(updated).toEqual({
      notifications: 'off',
      density: 'compact',
      ai: {
        location: 'server',
        defaultRunner: 'claude',
        features: { oneLiners: true, summaries: false, replySuggestions: true, jiraTriage: true },
      },
    });
    expect(await engine.services.settings.get(USER_ID)).toEqual(updated);
    expect(await engine.services.settings.get(OTHER_USER_ID)).toEqual(DEFAULT_USER_SETTINGS);
    expect(engine.events.published.map((entry) => [entry.userId, entry.event.type])).toEqual([
      [USER_ID, 'settings.updated'],
    ]);
  });
});

describe('SettingsService defaults and AI location', () => {
  it('uses injected defaults for users without stored settings', async () => {
    const defaults = {
      ...DEFAULT_USER_SETTINGS,
      ai: { ...DEFAULT_USER_SETTINGS.ai, location: 'server' as const },
    };
    const engine = createTestEngine({ aiRunnerLocation: 'server', settings: { defaults } });

    expect((await engine.services.settings.get(USER_ID)).ai.location).toBe('server');
    expect(await engine.services.ai.locationFor(USER_ID)).toBe('server');
    const patched = await engine.services.settings.update(USER_ID, { density: 'compact' });
    expect(patched.ai.location).toBe('server');
  });

  it('always reports and uses the pinned AI location', async () => {
    const engine = createTestEngine({ settings: { pinnedAiLocation: 'local' } });
    await engine.repositories.settings.save(USER_ID, {
      ...DEFAULT_USER_SETTINGS,
      ai: { ...DEFAULT_USER_SETTINGS.ai, location: 'server' },
    });

    expect((await engine.services.settings.get(USER_ID)).ai.location).toBe('local');
    const updated = await engine.services.settings.update(USER_ID, { ai: { location: 'server' } });
    expect(updated.ai.location).toBe('local');
    expect(await engine.services.ai.locationFor(USER_ID)).toBe('local');
  });

  it('keeps both of two concurrent patches', async () => {
    const engine = createTestEngine();

    await Promise.all([
      engine.services.settings.update(USER_ID, { density: 'compact' }),
      engine.services.settings.update(USER_ID, { notifications: 'urgent' }),
    ]);

    const stored = await engine.services.settings.get(USER_ID);
    expect(stored.density).toBe('compact');
    expect(stored.notifications).toBe('urgent');
  });

  it('relocates queued jobs left behind by an earlier failed relocation', async () => {
    const engine = createTestEngine();
    await engine.services.settings.update(USER_ID, { ai: { location: 'server' } });
    const jobId = 'job_stranded' as AiJobId;
    engine.db.tables.aiJobs.set(jobId, {
      id: jobId,
      userId: USER_ID,
      kind: 'summary',
      status: 'queued',
      runnerLocation: 'local',
      runner: 'claude',
      input: { kind: 'summary', threadId: 'thr_1' as ThreadId },
      output: null,
      error: null,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    await engine.services.settings.update(USER_ID, { density: 'compact' });

    expect(engine.db.tables.aiJobs.get(jobId)?.runnerLocation).toBe('server');
  });
});
