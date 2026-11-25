import { describe, expect, it } from 'vitest';
import { type MailAccount, MailAccountSchema, oldestAccount } from '../src/domain';

const account = (id: string, createdAt: string): MailAccount =>
  MailAccountSchema.parse({
    id,
    userId: 'user-1',
    provider: 'imap',
    displayName: id,
    senderName: null,
    email: `${id}@firma.sk`,
    color: '#5b8def',
    isPrimary: false,
    syncIntervalSeconds: 300,
    settings: {
      imap: { host: 'imap.firma.sk', port: 993, secure: true },
      smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
      username: `${id}@firma.sk`,
    },
    status: 'connected',
    lastError: null,
    lastSyncedAt: null,
    createdAt,
  });

describe('oldestAccount', () => {
  it('picks the earliest created account and breaks ties by id', () => {
    const late = account('acc-late', '2026-11-03T08:00:00.000Z');
    const tieB = account('acc-tie-b', '2026-11-01T08:00:00.000Z');
    const tieA = account('acc-tie-a', '2026-11-01T09:00:00.000+01:00');

    expect(oldestAccount([late, tieB, tieA])?.id).toBe('acc-tie-a');
    expect(oldestAccount<MailAccount>([])).toBeUndefined();
  });
});
