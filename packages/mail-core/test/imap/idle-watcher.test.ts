import type { GreenMailUser } from '@relay/config/test-infra';
import type { MailboxChange } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsMailAuthResolver, ImapClientFactory } from '../../src';
import { IdleWatcher } from '../../src/imap/idle-watcher';
import type { ImapClientOverrides } from '../../src/imap/imap-client-factory';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from '../support/greenmail';
import { createTokenProvider } from '../support/provider-harness';

class RecordingClientFactory extends ImapClientFactory {
  readonly created: ImapFlow[] = [];

  override async create(overrides?: ImapClientOverrides): Promise<ImapFlow> {
    const client = await super.create(overrides);
    this.created.push(client);
    return client;
  }
}

describe('IdleWatcher', () => {
  let user: GreenMailUser;
  let factory: RecordingClientFactory;

  beforeEach(async () => {
    user = await createGreenMailUser();
    factory = new RecordingClientFactory({
      endpoint: greenmailImap,
      allowPlaintext: true,
      auth: new CredentialsMailAuthResolver(
        buildAccount(user),
        passwordCredentials(user),
        createTokenProvider(),
      ),
    });
  });

  afterEach(async () => {
    await deleteGreenMailUser(user);
  });

  it('reconnects after the connection drops and asks for a resync', async () => {
    const changes: MailboxChange[] = [];
    const watcher = new IdleWatcher(factory, 'INBOX', (change) => changes.push(change), {
      autoIdleDelayMs: 100,
      maxIdleTimeMs: 60_000,
      backoff: { initialMs: 50, maxMs: 200 },
    });
    await watcher.start();

    factory.created[0]?.close();

    await vi.waitFor(
      () => {
        expect(factory.created).toHaveLength(2);
        expect(changes).toContainEqual({ type: 'exists', mailboxPath: 'INBOX', count: 0 });
      },
      { timeout: 5_000, interval: 50 },
    );

    await watcher.dispose();
    expect(factory.created[1]?.usable).toBe(false);
  });

  it('stops reconnecting once disposed', async () => {
    const watcher = new IdleWatcher(factory, 'INBOX', () => undefined, {
      autoIdleDelayMs: 100,
      maxIdleTimeMs: 60_000,
      backoff: { initialMs: 50, maxMs: 200 },
    });
    await watcher.start();
    await watcher.dispose();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(factory.created).toHaveLength(1);
  });
});
