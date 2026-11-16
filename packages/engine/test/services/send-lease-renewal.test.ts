import type { Draft, ScheduledSend } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, LeaseLostError } from '../../src';
import { setupReply } from '../support/compose-setup';
import { present } from '../support/fixtures';
import { MemoryDraftRepository } from '../support/memory/memory-draft-repository';
import { MemoryScheduledSendRepository } from '../support/memory/memory-scheduled-send-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const LEASE_MS = 600_000;
const RENEWAL_MS = 150_000;
const DUE_AT = '2026-11-15T11:00:00.000Z';

const draftReply = async (engine: TestEngine): Promise<Draft> => {
  const { reply } = await setupReply(engine);
  return engine.services.compose.createDraft(USER_ID, reply);
};

const sendDraft = (engine: TestEngine, draft: Draft) =>
  engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id });

const scheduleReply = async (engine: TestEngine): Promise<ScheduledSend> => {
  const { reply } = await setupReply(engine);
  const response = await engine.services.compose.send(USER_ID, {
    source: 'inline',
    draft: reply,
    scheduledAt: DUE_AT,
  });
  engine.clock.set(DUE_AT);
  return present(response.status === 'scheduled' ? response.scheduledSend : null);
};

const isoBefore = (engine: TestEngine, milliseconds: number): string =>
  new Date(engine.clock.now().getTime() - milliseconds).toISOString();

const memoryDrafts = (engine: TestEngine): MemoryDraftRepository => {
  expect(engine.repositories.drafts).toBeInstanceOf(MemoryDraftRepository);
  return engine.repositories.drafts as MemoryDraftRepository;
};

const memoryScheduledSends = (engine: TestEngine): MemoryScheduledSendRepository => {
  expect(engine.repositories.scheduledSends).toBeInstanceOf(MemoryScheduledSendRepository);
  return engine.repositories.scheduledSends as MemoryScheduledSendRepository;
};

const outlastLease = async (engine: TestEngine): Promise<void> => {
  engine.clock.advance(LEASE_MS - 60_000);
  await engine.timer.fire();
  engine.clock.advance(LEASE_MS - 60_000);
};

const lostLeaseWarnings = (engine: TestEngine) =>
  engine.logger.entries.filter((entry) => entry.message.includes('lease was lost'));

describe('send lease renewal', () => {
  it('renews the draft claim during a slow send so a second send cannot start', async () => {
    const engine = createTestEngine();
    const draft = await draftReply(engine);
    const during: { intervals: number[]; second: unknown } = { intervals: [], second: null };
    engine.sender.beforeSend = async () => {
      engine.sender.beforeSend = null;
      during.intervals = engine.timer.intervals;
      engine.clock.advance(LEASE_MS - 60_000);
      await engine.timer.fire();
      engine.clock.advance(LEASE_MS - 60_000);
      during.second = await sendDraft(engine, draft).catch((error: unknown) => error);
    };

    await sendDraft(engine, draft);

    expect(during.intervals).toEqual([RENEWAL_MS]);
    expect(during.second).toBeInstanceOf(ConflictError);
    expect(engine.sender.sent).toHaveLength(1);
    expect(engine.timer.intervals).toEqual([]);
    expect(await engine.repositories.drafts.findById(USER_ID, draft.id)).toBeNull();
  });

  it('stops before SMTP when the heartbeat finds the draft claim taken over', async () => {
    const engine = createTestEngine();
    const draft = await draftReply(engine);
    const taken = { claimedAt: '', claimed: false };
    engine.vault.beforeGet = async () => {
      engine.vault.beforeGet = null;
      engine.clock.advance(LEASE_MS + 1_000);
      taken.claimedAt = engine.clock.now().toISOString();
      const claim = { claimedAt: taken.claimedAt, staleBefore: isoBefore(engine, LEASE_MS) };
      taken.claimed = await engine.repositories.drafts.claimForSend(USER_ID, draft.id, claim);
      await engine.timer.fire();
    };

    await expect(sendDraft(engine, draft)).rejects.toThrow(LeaseLostError);

    expect(taken.claimed).toBe(true);
    expect(engine.sender.sent).toEqual([]);
    expect(lostLeaseWarnings(engine)).toHaveLength(1);
    expect(engine.db.tables.draftSendClaims.get(draft.id)).toBe(taken.claimedAt);
    expect(await engine.repositories.drafts.findById(USER_ID, draft.id)).not.toBeNull();
  });

  it('keeps a slow scheduled send leased so stale recovery and cancel leave it alone', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    const during: { recovered: unknown; cancel: unknown } = { recovered: null, cancel: null };
    engine.sender.beforeSend = async () => {
      engine.sender.beforeSend = null;
      engine.clock.advance(LEASE_MS - 60_000);
      await engine.timer.fire();
      engine.clock.advance(LEASE_MS - 60_000);
      during.recovered = await engine.services.compose.sendDueScheduled();
      during.cancel = await engine.services.compose
        .cancelScheduled(USER_ID, scheduled.id)
        .catch((error: unknown) => error);
    };

    const processed = await engine.services.compose.sendDueScheduled();

    expect(during.recovered).toEqual([]);
    expect(during.cancel).toBeInstanceOf(ConflictError);
    expect(processed).toMatchObject([{ id: scheduled.id, status: 'sent' }]);
    expect(engine.sender.sent).toHaveLength(1);
    expect(engine.timer.intervals).toEqual([]);
  });

  it('does not send a scheduled send that another worker reclaimed before SMTP', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    const taken = { claimedAt: '', released: 0, claimed: false };
    engine.vault.beforeGet = async () => {
      engine.vault.beforeGet = null;
      engine.clock.advance(LEASE_MS + 1_000);
      taken.claimedAt = engine.clock.now().toISOString();
      const scheduledSends = engine.repositories.scheduledSends;
      taken.released = await scheduledSends.releaseStaleSending(isoBefore(engine, LEASE_MS), []);
      taken.claimed = await scheduledSends.claim(scheduled.id, taken.claimedAt);
    };

    const processed = await engine.services.compose.sendDueScheduled();

    expect(taken).toMatchObject({ released: 1, claimed: true });
    expect(processed).toMatchObject([{ id: scheduled.id, status: 'sending' }]);
    expect(engine.sender.sent).toEqual([]);
    expect(engine.db.tables.scheduledSendClaims.get(scheduled.id)).toBe(taken.claimedAt);
    expect(engine.db.tables.draftSendClaims.has(scheduled.draftId)).toBe(false);
  });

  it('keeps the draft claim renewed until a slow cleanup after SMTP finishes', async () => {
    const engine = createTestEngine();
    const draft = await draftReply(engine);
    const drafts = memoryDrafts(engine);
    const during: { second: unknown } = { second: null };
    drafts.beforeDeleteRevision = async () => {
      drafts.beforeDeleteRevision = null;
      await outlastLease(engine);
      during.second = await sendDraft(engine, draft).catch((error: unknown) => error);
    };

    await sendDraft(engine, draft);

    expect(during.second).toBeInstanceOf(ConflictError);
    expect(engine.sender.sent).toHaveLength(1);
  });

  it('keeps a scheduled send leased until its completion is recorded', async () => {
    const engine = createTestEngine();
    const scheduled = await scheduleReply(engine);
    const scheduledSends = memoryScheduledSends(engine);
    const during: { recovered: unknown } = { recovered: null };
    scheduledSends.beforeMarkSent = async () => {
      scheduledSends.beforeMarkSent = null;
      await outlastLease(engine);
      during.recovered = await engine.services.compose.sendDueScheduled();
    };

    const processed = await engine.services.compose.sendDueScheduled();

    expect(during.recovered).toEqual([]);
    expect(processed).toMatchObject([{ id: scheduled.id, status: 'sent' }]);
    expect(engine.sender.sent).toHaveLength(1);
  });
});
