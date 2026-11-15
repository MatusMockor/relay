import type { ScheduledSend } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { setupReply } from '../support/compose-setup';
import { present } from '../support/fixtures';
import { MemoryDraftRepository } from '../support/memory/memory-draft-repository';
import { MemoryPendingWorkRepository } from '../support/memory/memory-pending-work-repository';
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

const memoryPendingWork = (engine: TestEngine): MemoryPendingWorkRepository => {
  const repository = engine.repositories.pendingWork;
  expect(repository).toBeInstanceOf(MemoryPendingWorkRepository);
  return repository as MemoryPendingWorkRepository;
};

const statusOf = async (engine: TestEngine, scheduled: ScheduledSend) =>
  (await engine.repositories.scheduledSends.findById(USER_ID, scheduled.id))?.status;

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

  it('keeps the draft and never resends a delivery whose completion was not recorded', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 3;
    engine.clock.set('2026-11-15T11:00:01.000Z');

    await engine.services.compose.sendDueScheduled();

    expect(engine.sender.sent).toHaveLength(1);
    expect(await statusOf(engine, scheduled)).toBe('sending');
    expect((await engine.services.compose.listDrafts(USER_ID)).map((draft) => draft.id)).toEqual([
      scheduled.draftId,
    ]);
    expect([...engine.db.tables.pendingWork.values()].map((work) => work.kind)).toEqual([
      'scheduled-send-sent',
    ]);

    engine.clock.set('2026-11-15T11:10:02.000Z');
    await engine.services.compose.sendDueScheduled();

    expect(engine.sender.sent).toHaveLength(1);
    expect(await statusOf(engine, scheduled)).toBe('sent');
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('holds an unrecorded delivery in the process while its confirmation cannot be stored', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 100;
    memoryPendingWork(engine).failPut = 'disk full';
    engine.clock.set('2026-11-15T11:00:01.000Z');
    await engine.services.compose.sendDueScheduled();

    engine.clock.set('2026-11-15T11:10:02.000Z');
    expect(await engine.services.compose.recoverStaleScheduled()).toBe(0);
    await engine.services.compose.sendDueScheduled();

    expect(engine.sender.sent).toHaveLength(1);
    expect(await statusOf(engine, scheduled)).toBe('sending');
    memoryScheduledSends(engine).failMarkSent = 0;
    memoryPendingWork(engine).failPut = null;
    await engine.services.compose.sendDueScheduled();
    expect(engine.sender.sent).toHaveLength(1);
    expect(await statusOf(engine, scheduled)).toBe('sent');
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
  });

  it('refuses to cancel a delivery whose completion is still being recorded', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 3;
    engine.clock.set('2026-11-15T11:00:01.000Z');
    await engine.services.compose.sendDueScheduled();

    engine.clock.set('2026-11-15T11:10:02.000Z');

    await expect(
      engine.services.compose.cancelScheduled(USER_ID, scheduled.id),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await statusOf(engine, scheduled)).toBe('sending');
  });

  it('does not release stale sends when pending confirmations cannot be read', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    await engine.repositories.scheduledSends.claim(scheduled.id, '2026-11-15T11:00:00.000Z');
    memoryPendingWork(engine).failListByKind = 'database is locked';
    engine.clock.set('2026-11-15T11:10:01.000Z');

    await expect(engine.services.compose.sendDueScheduled()).rejects.toThrow('database is locked');

    expect(engine.sender.sent).toHaveLength(0);
    expect(await statusOf(engine, scheduled)).toBe('sending');
  });

  it('refuses to send by hand a draft whose scheduled delivery is still unconfirmed', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    memoryScheduledSends(engine).failMarkSent = 100;
    engine.clock.set('2026-11-15T11:00:01.000Z');
    await engine.services.compose.sendDueScheduled();

    engine.clock.set('2026-11-15T11:11:00.000Z');

    await expect(
      engine.services.compose.send(USER_ID, { source: 'draft', draftId: scheduled.draftId }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(engine.sender.sent).toHaveLength(1);
  });

  it('retries removing a delivered draft and keeps it unsendable meanwhile', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    const drafts = engine.repositories.drafts;
    expect(drafts).toBeInstanceOf(MemoryDraftRepository);
    (drafts as MemoryDraftRepository).failDeleteRevision = 'database is locked';
    engine.clock.set('2026-11-15T11:00:01.000Z');
    await engine.services.compose.sendDueScheduled();

    expect(await statusOf(engine, scheduled)).toBe('sent');
    await expect(
      engine.services.compose.send(USER_ID, { source: 'draft', draftId: scheduled.draftId }),
    ).rejects.toMatchObject({ code: 'conflict' });
    (drafts as MemoryDraftRepository).failDeleteRevision = null;
    await engine.services.compose.sendDueScheduled();

    expect(engine.sender.sent).toHaveLength(1);
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('leaves a scheduled send for recovery while its draft is being sent by hand', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    const handSend = {
      claimedAt: '2026-11-15T11:00:00.000Z',
      staleBefore: '2026-11-15T10:50:00.000Z',
    };
    expect(
      await engine.repositories.drafts.claimForSend(USER_ID, scheduled.draftId, handSend),
    ).toBe(true);
    engine.clock.set('2026-11-15T11:00:01.000Z');

    await engine.services.compose.sendDueScheduled();

    expect(await statusOf(engine, scheduled)).toBe('sending');
    await engine.repositories.drafts.releaseSendClaim(
      USER_ID,
      scheduled.draftId,
      handSend.claimedAt,
    );
    engine.clock.set('2026-11-15T11:10:02.000Z');
    await engine.services.compose.sendDueScheduled();
    expect(await statusOf(engine, scheduled)).toBe('sent');
    expect(engine.sender.sent).toHaveLength(1);
  });
});
