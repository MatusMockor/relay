import type { ScheduledSend } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { setupReply } from '../support/compose-setup';
import { present } from '../support/fixtures';
import { MemoryScheduledSendRepository } from '../support/memory/memory-scheduled-send-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const scheduleReply = async (engine: TestEngine): Promise<ScheduledSend> => {
  const { reply } = await setupReply(engine);
  const response = await engine.services.compose.send(USER_ID, {
    source: 'inline',
    draft: reply,
    scheduledAt: '2026-11-15T11:00:00.000Z',
  });
  return present(response.status === 'scheduled' ? response.scheduledSend : null);
};

const memoryScheduledSends = (engine: TestEngine): MemoryScheduledSendRepository => {
  const repository = engine.repositories.scheduledSends;
  expect(repository).toBeInstanceOf(MemoryScheduledSendRepository);
  return repository as MemoryScheduledSendRepository;
};

describe('ScheduledSendService robustness', () => {
  it('allows only one active scheduled send per draft', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);

    await expect(
      engine.services.compose.send(USER_ID, {
        source: 'draft',
        draftId: scheduled.draftId,
        scheduledAt: '2026-11-15T12:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await engine.services.compose.listScheduled(USER_ID)).toHaveLength(1);
  });

  it('marks a delivered send as sent when the first completion write fails', async () => {
    const engine = createTestEngine();
    await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 1;
    engine.clock.set('2026-11-15T11:00:01.000Z');

    const processed = await engine.services.compose.sendDueScheduled();

    expect(processed.map((item) => item.status)).toEqual(['sent']);
    expect(engine.sender.sent).toHaveLength(1);
  });

  it('never marks a delivered send as failed when completion cannot be recorded', async () => {
    const engine = createTestEngine();
    await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 10;
    engine.clock.set('2026-11-15T11:00:01.000Z');

    const processed = await engine.services.compose.sendDueScheduled();

    expect(processed.map((item) => item.status)).toEqual(['sending']);
    expect(engine.sender.sent).toHaveLength(1);
    expect(
      engine.logger.entries.some(
        (entry) => entry.message === 'Recording a delivered scheduled send failed',
      ),
    ).toBe(true);
  });

  it('returns sends stuck in sending to pending after the lease and delivers them', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    expect(
      await engine.repositories.scheduledSends.claim(scheduled.id, '2026-11-15T11:00:00.000Z'),
    ).toBe(true);

    engine.clock.set('2026-11-15T11:05:00.000Z');
    expect(await engine.services.compose.recoverStaleScheduled()).toBe(0);
    expect(await engine.services.compose.sendDueScheduled()).toEqual([]);

    engine.clock.set('2026-11-15T11:10:01.000Z');
    const processed = await engine.services.compose.sendDueScheduled();

    expect(processed.map((item) => item.status)).toEqual(['sent']);
    expect(engine.sender.sent).toHaveLength(1);
  });

  it('cancels a send stuck in sending only after the lease', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    await engine.repositories.scheduledSends.claim(scheduled.id, '2026-11-15T11:00:00.000Z');

    engine.clock.set('2026-11-15T11:05:00.000Z');
    await expect(
      engine.services.compose.cancelScheduled(USER_ID, scheduled.id),
    ).rejects.toMatchObject({ code: 'conflict' });

    engine.clock.set('2026-11-15T11:10:01.000Z');
    await engine.services.compose.cancelScheduled(USER_ID, scheduled.id);
    const current = await engine.repositories.scheduledSends.findById(USER_ID, scheduled.id);
    expect(current?.status).toBe('cancelled');
  });
});
