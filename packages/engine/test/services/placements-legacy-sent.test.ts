import { describe, expect, it } from 'vitest';
import { type LegacySentIds, seedLegacySent } from '../support/legacy-sent';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const trashedSources = async (ids: LegacySentIds) => {
  const engine: TestEngine = createTestEngine();
  const seeded = await seedLegacySent(engine, ids);
  seeded.server.failConnect = 'offline';
  await engine.services.actions.apply(USER_ID, seeded.sent.threadId, { type: 'trash' });
  const ops = await engine.repositories.pendingWork.list(seeded.account.id, 'provider-op');
  const sources = ops.map(({ payload }) => payload.source);
  return { ...seeded, sources };
};

describe('trash of a legacy Gmail Sent row next to an All Mail row', () => {
  it('treats the All Mail row as the filed Sent copy when the Sent row has no email id', async () => {
    const { sources, allMail } = await trashedSources({
      sentEmailId: null,
      allMailEmailId: 'gm-out',
    });

    expect(sources).not.toContainEqual(expect.objectContaining({ mailboxId: allMail.id }));
  });

  it('treats the All Mail row as the filed Sent copy when it has no email id', async () => {
    const { sources, allMail } = await trashedSources({
      sentEmailId: 'gm-out',
      allMailEmailId: null,
    });

    expect(sources).not.toContainEqual(expect.objectContaining({ mailboxId: allMail.id }));
  });

  it('never links rows whose email ids differ', async () => {
    const { sources, archived } = await trashedSources({
      sentEmailId: 'gm-out',
      allMailEmailId: 'gm-other',
    });

    expect(sources).toContainEqual(archived.placements[0]);
  });
});
