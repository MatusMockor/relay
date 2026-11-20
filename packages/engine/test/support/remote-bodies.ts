import type { Message } from '@relay/shared/domain';
import { expect } from 'vitest';
import type { BodyOptions } from '../../src';
import { deliverMail, messageHeader, present, type SeededAccount, seedAccount } from './fixtures';
import { backfillUntilDone, historyDate, storedMessages } from './history';
import { createTestEngine, type TestEngine, USER_ID } from './test-engine';

export const OLD_COUNT = 6;

export interface RemoteBodySetup {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
}

export const oldMailId = (index: number): string => `old-${String(index)}`;

export const setupRemoteBodies = async (
  bodies: Partial<BodyOptions> = {},
  seed: (seeded: SeededAccount) => void = () => undefined,
): Promise<RemoteBodySetup> => {
  const engine = createTestEngine({ bodies, receivedAttachments: true });
  const seeded = await seedAccount(engine);
  Array.from({ length: OLD_COUNT }, (_, index) =>
    deliverMail(seeded.server, 'Archive', {
      id: oldMailId(index),
      date: historyDate(index, 100),
      body: `Telo starej správy ${String(index)}`,
    }),
  );
  deliverMail(seeded.server, 'INBOX', { id: 'fresh', body: 'Čerstvá správa' });
  seed(seeded);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await backfillUntilDone(engine, seeded.account.id);
  return { engine, seeded };
};

export const storedByHeader = (engine: TestEngine, id: string, mailboxPath?: string): Message => {
  const found = storedMessages(engine).filter(
    (message) => message.messageIdHeader === messageHeader(id),
  );
  const mailboxes = [...engine.db.tables.mailboxes.values()];
  const inMailbox = found.find(
    (message) =>
      mailboxPath === undefined ||
      mailboxes.find((mailbox) => mailbox.id === message.mailboxId)?.path === mailboxPath,
  );
  return present(inMailbox);
};

export const remoteOld = (engine: TestEngine, index: number): Message => {
  const message = storedByHeader(engine, oldMailId(index), 'Archive');
  expect(message.bodyState).toBe('remote');
  expect(message.textBody).toBeNull();
  return message;
};
