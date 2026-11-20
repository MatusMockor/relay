import { describe, expect, it } from 'vitest';
import { accountId, buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore } from './support/test-database';

const PLAN_SQL = `explain query plan
  select thread_id from messages
  where account_id = ? and in_reply_to in (?, ?)
  order by date_ts asc, seq asc limit 1`;

describe('reply thread lookup', () => {
  it('finds the oldest stored reply to any of the message ids within the account', async () => {
    const store = createTestStore();
    const { account, inbox } = await seedAccount(store.repositories);
    const other = await seedAccount(store.repositories, {
      id: accountId('acc-2'),
      email: 'druhy@firma.sk',
    });
    const reply = (id: string, parent: string, date: string, owner = account.id) =>
      store.repositories.messages.upsert(
        buildMessage({
          id: messageId(id),
          threadId: threadId(`thr-${id}`),
          accountId: owner,
          mailboxId: owner === account.id ? inbox.id : other.inbox.id,
          uid: Number(id.replace(/\D/g, '')),
          messageIdHeader: `<${id}@klient.sk>`,
          inReplyTo: parent,
          date,
        }),
        NO_HEADERS,
      );
    await reply('m2', '<parent@klient.sk>', '2025-02-03T10:00:00.000Z');
    await reply('m1', '<parent@klient.sk>', '2025-02-01T10:00:00.000Z');
    await reply('m3', '<other@klient.sk>', '2025-01-01T10:00:00.000Z');
    await reply('m4', '<foreign@klient.sk>', '2024-01-01T10:00:00.000Z', other.account.id);
    const { messages } = store.repositories;

    expect(await messages.findThreadIdByReplyTo(account.id, ['<parent@klient.sk>'])).toBe('thr-m1');
    expect(
      await messages.findThreadIdByReplyTo(account.id, ['<parent@klient.sk>', '<other@klient.sk>']),
    ).toBe('thr-m3');
    expect(await messages.findThreadIdByReplyTo(account.id, ['<foreign@klient.sk>'])).toBeNull();
    expect(await messages.findThreadIdByReplyTo(account.id, [])).toBeNull();
    store.database.close();
  });

  it('serves the lookup from the account reply index', () => {
    const store = createTestStore();

    const plan = store.database.sqlite
      .prepare<[string, string, string], { detail: string }>(PLAN_SQL)
      .all('acc-1', '<a@x>', '<b@x>')
      .map((row) => row.detail)
      .join('\n');

    expect(plan).toContain('messages_account_reply_idx');
    store.database.close();
  });
});
