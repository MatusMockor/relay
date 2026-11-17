import { UnsubscribeService, type UnsubscribeSender } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { buildMessage, buildThread, newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const UNSUBSCRIBE_HEADERS = new Map([
  ['list-unsubscribe', ['<mailto:off@news.example.com>, <https://news.example.com/u/42>']],
  ['list-unsubscribe-post', ['List-Unsubscribe=One-Click']],
]);

class RecordingSender implements UnsubscribeSender {
  readonly sent: string[] = [];

  sendOneClick(url: string): Promise<void> {
    this.sent.push(url);
    return Promise.resolve();
  }
}

describe('PgMessageRepository headers', () => {
  const context = usePgTestContext();

  it('reads stored headers only for the owner of the message', async () => {
    const seeded = await seedAccount(context.repositories);
    const thread = buildThread(seeded.account.id);
    const message = buildMessage(thread, seeded.mailboxes.inbox);
    await context.repositories.messages.upsert(message, UNSUBSCRIBE_HEADERS);
    await context.repositories.threads.upsert(thread);
    const stranger = await seedAccount(context.repositories);

    await expect(
      context.repositories.messages.findHeaders(seeded.user.id, message.id),
    ).resolves.toEqual(UNSUBSCRIBE_HEADERS);
    await expect(
      context.repositories.messages.findHeaders(stranger.user.id, message.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.messages.findHeaders(seeded.user.id, newId('message')),
    ).resolves.toBeNull();
  });

  it('resolves and sends a one-click unsubscribe from the stored headers', async () => {
    const seeded = await seedAccount(context.repositories);
    const thread = buildThread(seeded.account.id);
    await context.repositories.messages.upsert(
      buildMessage(thread, seeded.mailboxes.inbox),
      UNSUBSCRIBE_HEADERS,
    );
    await context.repositories.threads.upsert(thread);
    const sender = new RecordingSender();
    const service = new UnsubscribeService({ messages: context.repositories.messages, sender });

    await expect(service.options(seeded.user.id, thread.id)).resolves.toEqual({
      oneClick: true,
      url: 'https://news.example.com/u/42',
      mailto: { to: 'off@news.example.com', subject: null, body: null },
    });
    await service.unsubscribe(seeded.user.id, thread.id, 'https://news.example.com/u/42');

    expect(sender.sent).toEqual(['https://news.example.com/u/42']);
  });
});
