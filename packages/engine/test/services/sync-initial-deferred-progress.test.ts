import { describe, expect, it } from 'vitest';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T12:00:00.000Z`;

const staged = (engine: TestEngine) =>
  engine.events
    .ofType('sync.progress')
    .filter((event) => event.data.stage !== undefined)
    .map(({ data }) => [data.stage, data.processed, data.total] as const);

const ratios = (engine: TestEngine, stage: string): number[] =>
  staged(engine)
    .filter(([name]) => name === stage)
    .map(([, processed, total]) => (total === null || total === 0 ? 0 : processed / total));

const isMonotonic = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value >= (values[index - 1] ?? 0));

describe('initial sync progress with deferred mailboxes', () => {
  it('reports the deferred mailboxes as their own stage so no stage goes backwards', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 5, firstBatchSize: 2, firstPageConversations: 0 },
    });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3, 4, 5, 6].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `in-${String(date)}`, date: day(date) });
    });
    [7, 8, 9, 10, 11, 12, 13].forEach((date) => {
      deliverMail(server, 'Trash', { id: `tr-${String(date)}`, date: day(date) });
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(isMonotonic(ratios(engine, 'backlog'))).toBe(true);
    expect(isMonotonic(ratios(engine, 'folders'))).toBe(true);
    expect(staged(engine).filter(([stage]) => stage === 'folders')).toEqual([
      ['folders', 0, 7],
      ['folders', 5, 7],
      ['folders', 7, 7],
    ]);
    const stages = staged(engine).map(([stage]) => stage);
    expect(stages.lastIndexOf('backlog')).toBeLessThan(stages.indexOf('folders'));
  });

  it('counts a held reply in the folders stage instead of leaving the backlog unfinished', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Novinky', date: day(13) });
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Rozpočet', date: day(14) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const backlog = staged(engine).filter(([stage]) => stage === 'backlog');
    expect(backlog.at(-1)?.[1]).toBe(backlog.at(-1)?.[2]);
    expect(staged(engine).filter(([stage]) => stage === 'folders')).toEqual([
      ['folders', 0, 1],
      ['folders', 1, 1],
    ]);
  });
});
