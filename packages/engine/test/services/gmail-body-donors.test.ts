import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ECHO: MailSpec = { id: 'echo', labels: ['\\Inbox'], date: '2026-11-14T08:00:00.000Z' };

const makeRemote = (engine: TestEngine, message: Message): void => {
  engine.db.tables.messages.set(message.id, {
    ...message,
    bodyState: 'remote',
    textBody: null,
    htmlBody: null,
  });
};

const bodyOfLegacyKeeper = async (spec: LegacySpec) => {
  const engine = createTestEngine();
  const { server, pairs } = await seedLegacyDuplicates(engine, [spec]);
  const keeper = present(engine.db.tables.messages.get(present(pairs[0]).keeperId));
  makeRemote(engine, keeper);
  server.failConnect = 'offline';
  return engine.services.bodies.get(USER_ID, keeper.id);
};

describe('body donors on Gmail', () => {
  it('never lends a body between messages with one Message-ID and different email ids', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', { ...ECHO, emailId: 'gm-a', body: 'Prvá verzia' });
    deliverMail(server, 'INBOX', { ...ECHO, emailId: 'gm-b', body: 'Druhá verzia' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const messages = [...engine.db.tables.messages.values()];
    expect(messages).toHaveLength(2);
    const first = present(messages.find((message) => message.emailId === 'gm-a'));
    makeRemote(engine, first);
    server.failConnect = 'offline';

    await expect(engine.services.bodies.get(USER_ID, first.id)).resolves.toEqual({
      status: 'offline',
    });
  });

  it('lends the body of an unmerged row with the same email id', async () => {
    await expect(bodyOfLegacyKeeper({ ...ECHO, body: 'Spoločné telo' })).resolves.toMatchObject({
      status: 'ok',
      textBody: 'Spoločné telo',
    });
  });

  it('lends the body between unresolved rows without an email id', async () => {
    await expect(
      bodyOfLegacyKeeper({ ...ECHO, body: 'Spoločné telo', unresolved: true }),
    ).resolves.toMatchObject({ status: 'ok', textBody: 'Spoločné telo' });
  });
});
