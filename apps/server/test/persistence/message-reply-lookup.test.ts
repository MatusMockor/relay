import { describe, expect, it } from 'vitest';
import { seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const longMessageId = `<${'a'.repeat(3_000)}@klient.sk>`;

describe('PgMessageRepository.findThreadIdByReplyTo', () => {
  const context = usePgTestContext();

  it('finds the oldest stored reply to any of the message ids within the account', async () => {
    const seeded = await seedAccount(context.repositories);
    await seedThread(
      context.repositories,
      seeded,
      {},
      { inReplyTo: '<parent@klient.sk>', date: '2025-02-03T10:00:00.000Z' },
    );
    const oldest = await seedThread(
      context.repositories,
      seeded,
      {},
      { inReplyTo: '<parent@klient.sk>', date: '2025-02-01T10:00:00.000Z' },
    );
    const other = await seedThread(
      context.repositories,
      seeded,
      {},
      { inReplyTo: '<other@klient.sk>', date: '2025-01-01T10:00:00.000Z' },
    );
    const foreign = await seedAccount(context.repositories, seeded.user);
    await seedThread(context.repositories, foreign, {}, { inReplyTo: '<foreign@klient.sk>' });
    const { messages } = context.repositories;

    await expect(
      messages.findThreadIdByReplyTo(seeded.account.id, ['<parent@klient.sk>']),
    ).resolves.toBe(oldest.thread.id);
    await expect(
      messages.findThreadIdByReplyTo(seeded.account.id, [
        '<parent@klient.sk>',
        '<other@klient.sk>',
        '<parent@klient.sk>',
      ]),
    ).resolves.toBe(other.thread.id);
    await expect(
      messages.findThreadIdByReplyTo(seeded.account.id, ['<foreign@klient.sk>']),
    ).resolves.toBeNull();
    await expect(messages.findThreadIdByReplyTo(seeded.account.id, [])).resolves.toBeNull();
  });

  it('stores and finds a reply whose In-Reply-To exceeds the B-tree entry size', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(
      context.repositories,
      seeded,
      {},
      { inReplyTo: longMessageId },
    );

    await expect(
      context.repositories.messages.findThreadIdByReplyTo(seeded.account.id, [longMessageId]),
    ).resolves.toBe(thread.id);
  });
});
