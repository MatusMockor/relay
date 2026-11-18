import type { MailAccount } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { MailCopies } from '../../src/services/shared/mail-copies';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const copiesOf = async (overrides: Partial<MailAccount>) => {
  const engine = createTestEngine();
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1' });
  deliverMail(server, 'Archive', { id: 'm1' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const messages = [...engine.db.tables.messages.values()];
  expect(messages).toHaveLength(2);
  const policy = MailCopies.of({ ...account, ...overrides });
  return new Set(messages.map((message) => policy.identityOf(message))).size;
};

describe('MailCopies', () => {
  it('links the INBOX and All Mail copies of one Gmail message', async () => {
    expect(await copiesOf({ provider: 'gmail' })).toBe(1);
    expect(
      await copiesOf({
        settings: {
          imap: { host: 'IMAP.gmail.com', port: 993, secure: true },
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          username: 'alice@example.com',
        },
      }),
    ).toBe(1);
  });

  it('keeps same Message-ID copies on a plain IMAP server apart', async () => {
    expect(await copiesOf({})).toBe(2);
  });
});
