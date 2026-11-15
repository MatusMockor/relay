import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialsMailAuthResolver, ImapClientFactory } from '../../src';
import { ImapConnection } from '../../src/imap/imap-connection';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from '../support/greenmail';
import { createTokenProvider } from '../support/provider-harness';
import type { GreenMailUser } from '@relay/config/test-infra';

describe('ImapConnection', () => {
  let user: GreenMailUser;
  let connection: ImapConnection;

  beforeEach(async () => {
    user = await createGreenMailUser();
    const account = buildAccount(user);
    connection = new ImapConnection(
      new ImapClientFactory({
        endpoint: greenmailImap,
        allowPlaintext: true,
        auth: new CredentialsMailAuthResolver(
          account,
          passwordCredentials(user),
          createTokenProvider(),
        ),
      }),
    );
  });

  afterEach(async () => {
    await connection.close();
    await deleteGreenMailUser(user);
  });

  it('reuses a usable client and reconnects after the socket closes', async () => {
    const first = await connection.acquire();
    expect(await connection.acquire()).toBe(first);

    first.close();
    const second = await connection.acquire();

    expect(second).not.toBe(first);
    expect(second.usable).toBe(true);
  });

  it('retries an idempotent operation once when the connection drops mid-command', async () => {
    let attempts = 0;
    const result = await connection.run(
      { operation: 'noop', retryOnDisconnect: true },
      async (client) => {
        attempts += 1;
        if (attempts === 1) {
          client.close();
        }
        await client.noop();
        return client.usable;
      },
    );

    expect(attempts).toBe(2);
    expect(result).toBe(true);
  });
});
