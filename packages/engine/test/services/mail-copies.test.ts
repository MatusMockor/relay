import type { MailAccount } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { MailCopies } from '../../src/services/shared/mail-copies';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const keysOf = async (emailIds: readonly [string, string], overrides: Partial<MailAccount>) => {
  const engine = createTestEngine();
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', emailId: emailIds[0] });
  deliverMail(server, 'Archive', { id: 'm1', emailId: emailIds[1] });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const messages = [...engine.db.tables.messages.values()];
  expect(messages).toHaveLength(2);
  const policy = MailCopies.of({ ...account, ...overrides });
  return new Set(messages.map((message) => policy.logicalKeyOf(message))).size;
};

describe('MailCopies', () => {
  it('links unmerged Gmail rows that share one email id', async () => {
    expect(await keysOf(['gm-1', 'gm-1'], { provider: 'gmail' })).toBe(1);
    expect(
      await keysOf(['gm-1', 'gm-1'], {
        settings: {
          imap: { host: 'IMAP.gmail.com', port: 993, secure: true },
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          username: 'alice@example.com',
        },
      }),
    ).toBe(1);
  });

  it('keeps Gmail messages with one Message-ID but different email ids apart', async () => {
    expect(await keysOf(['gm-1', 'gm-2'], { provider: 'gmail' })).toBe(2);
  });

  it('keeps plain IMAP copies apart even when the server reports one email id', async () => {
    expect(await keysOf(['obj-1', 'obj-1'], {})).toBe(2);
  });
});
