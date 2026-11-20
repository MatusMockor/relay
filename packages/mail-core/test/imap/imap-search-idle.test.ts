import type { GreenMailUser } from '@relay/config/test-infra';
import type { ImapFlow } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsMailAuthResolver, ImapClientFactory } from '../../src';
import { ImapConnection } from '../../src/imap/imap-connection';
import { searchText } from '../../src/imap/search-text';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from '../support/greenmail';
import { createTokenProvider } from '../support/provider-harness';
import { textSearchMail } from '../support/text-search-mail';

class QuickIdleFactory extends ImapClientFactory {
  readonly created: ImapFlow[] = [];

  override async create(): Promise<ImapFlow> {
    const client = await super.create({ autoIdleDelayMs: 50, maxIdleTimeMs: 60_000 });
    this.created.push(client);
    return client;
  }
}

const query = { terms: ['kôň'], field: 'all' as const, limit: 50 };

describe('raw IMAP text search on an idling session', () => {
  let user: GreenMailUser;
  let factory: QuickIdleFactory;
  let connection: ImapConnection;

  beforeEach(async () => {
    user = await createGreenMailUser();
    factory = new QuickIdleFactory({
      endpoint: greenmailImap,
      allowPlaintext: true,
      auth: new CredentialsMailAuthResolver(
        buildAccount(user),
        passwordCredentials(user),
        createTokenProvider(),
      ),
    });
    connection = new ImapConnection(factory);
    const admin = await connection.acquire();
    await admin.append(
      'INBOX',
      textSearchMail({
        from: { name: 'Jana', email: 'jana@relay.test' },
        to: user.email,
        subject: 'Stajňa',
        body: 'Kôň je žltý.',
        charset: 'utf-8',
      }),
    );
  });

  afterEach(async () => {
    await connection.close();
    await deleteGreenMailUser(user);
  });

  it('ends IDLE before the raw SEARCH so a lingering session still answers promptly', async () => {
    const status = await connection.run(
      { operation: 'status', retryOnDisconnect: true },
      (client) => client.status('INBOX', { uidValidity: true }),
    );
    const uidValidity = Number(status.uidValidity);
    expect(await searchText(connection, 'INBOX', uidValidity, query)).toEqual({
      uids: [1],
      complete: true,
    });
    const [client] = factory.created;
    await vi.waitFor(() => {
      expect(client?.idling).toBe(true);
    });

    const started = Date.now();
    const found = await searchText(connection, 'INBOX', uidValidity, query);

    expect(found).toEqual({ uids: [1], complete: true });
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 10_000);
});
