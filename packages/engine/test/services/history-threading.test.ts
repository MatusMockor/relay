import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  deliverMail,
  type MailSpec,
  messageHeader,
  present,
  seedAccount,
} from '../support/fixtures';
import { backfillUntilDone, storedMessages } from '../support/history';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const OLD = '2025-03-0';

const oldMail = (day: number, spec: MailSpec): MailSpec => ({
  ...spec,
  date: `${OLD}${String(day)}T08:00:00.000Z`,
});

const threadOf = (engine: TestEngine, id: string): string =>
  present(
    storedMessages(engine).find(
      (message: Message) => message.messageIdHeader === messageHeader(id),
    ),
  ).threadId;

const backfilled = async (specs: readonly MailSpec[]): Promise<TestEngine> => {
  const engine = createTestEngine();
  const { account, server } = await seedAccount(engine);
  specs.forEach((spec) => deliverMail(server, 'Archive', spec));
  await engine.services.sync.syncAccount(USER_ID, account.id);
  expect(storedMessages(engine)).toEqual([]);
  await backfillUntilDone(engine, account.id);
  expect(storedMessages(engine)).toHaveLength(specs.length);
  return engine;
};

describe('history threading', () => {
  it('joins a parent stored after its reply', async () => {
    const engine = await backfilled([
      oldMail(1, { id: 'offer', subject: 'Ponuka' }),
      oldMail(2, {
        id: 'answer',
        subject: 'Odpoveď k cene',
        inReplyTo: 'offer',
        references: ['offer'],
      }),
    ]);

    expect(threadOf(engine, 'offer')).toBe(threadOf(engine, 'answer'));
  });

  it('keeps sibling replies of a parent in one thread', async () => {
    const engine = await backfilled([
      oldMail(1, { id: 'plan', subject: 'Plán' }),
      oldMail(2, { id: 'first', subject: 'Prvý návrh', inReplyTo: 'plan', references: ['plan'] }),
      oldMail(3, { id: 'second', subject: 'Druhý návrh', inReplyTo: 'plan', references: ['plan'] }),
    ]);

    expect(new Set(['plan', 'first', 'second'].map((id) => threadOf(engine, id))).size).toBe(1);
  });

  it('folds a reversed three level chain into one thread', async () => {
    const engine = await backfilled([
      oldMail(1, { id: 'root', subject: 'Zmluva' }),
      oldMail(2, { id: 'middle', subject: 'Pripomienky', inReplyTo: 'root', references: ['root'] }),
      oldMail(3, {
        id: 'leaf',
        subject: 'Finálna verzia',
        inReplyTo: 'middle',
        references: ['root', 'middle'],
      }),
      oldMail(4, { id: 'unrelated', subject: 'Obed' }),
    ]);

    const chain = new Set(['root', 'middle', 'leaf'].map((id) => threadOf(engine, id)));
    expect(chain.size).toBe(1);
    expect(chain.has(threadOf(engine, 'unrelated'))).toBe(false);
    expect(engine.db.tables.threads.size).toBe(2);
  });

  it('keeps a reply chain together when a batch boundary falls between two replies', async () => {
    const engine = createTestEngine({
      sync: { history: { sliceMessages: 500, sliceMs: 15_000, batch: 2, sliceSearches: 64 } },
    });
    const { account, server } = await seedAccount(engine);
    [
      oldMail(1, { id: 'root', subject: 'Zmluva' }),
      oldMail(2, { id: 'reply-1', subject: 'Re: Zmluva', inReplyTo: 'root', references: ['root'] }),
      oldMail(3, {
        id: 'reply-2',
        subject: 'Re: Zmluva',
        inReplyTo: 'reply-1',
        references: ['root', 'reply-1'],
      }),
      oldMail(4, { id: 'other', subject: 'Iná vec' }),
    ].forEach((spec) => deliverMail(server, 'Archive', spec));
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await backfillUntilDone(engine, account.id);

    expect(new Set(['root', 'reply-1', 'reply-2'].map((id) => threadOf(engine, id))).size).toBe(1);
    expect(threadOf(engine, 'other')).not.toBe(threadOf(engine, 'root'));
  });
});
