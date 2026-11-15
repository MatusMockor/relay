import { describe, expect, it } from 'vitest';
import type { MailboxChange, RawMessage, RemoteFlagChange } from '../../src';
import { deliverMail, standardServer } from '../support/fixtures';
import { FakeMailProvider } from '../support/mail/fake-mail-provider';
import type { FakeMailServer } from '../support/mail/fake-mail-server';

const connectedProvider = async (server: FakeMailServer): Promise<FakeMailProvider> => {
  const provider = new FakeMailProvider(server, { kind: 'password', password: server.password });
  await provider.connect();
  return provider;
};

const collect = async <Item>(items: AsyncIterable<Item>): Promise<Item[]> => {
  const collected: Item[] = [];
  for await (const item of items) {
    collected.push(item);
  }
  return collected;
};

describe('FakeMailProvider streaming fetches', () => {
  it('fails fetchSince while the server fails operations', async () => {
    const server = standardServer();
    deliverMail(server, 'INBOX', { id: 'm1' });
    const provider = await connectedProvider(server);
    server.failOperations = 'offline';

    await expect(collect<RawMessage>(provider.fetchSince('INBOX', null))).rejects.toThrow(
      'offline',
    );
  });

  it('fails fetchFlagChanges while the server fails operations', async () => {
    const server = standardServer();
    deliverMail(server, 'INBOX', { id: 'm1' });
    const provider = await connectedProvider(server);
    server.failOperations = 'offline';

    await expect(
      collect<RemoteFlagChange>(provider.fetchFlagChanges('INBOX', '0')),
    ).rejects.toThrow('offline');
  });
});

describe('FakeMailProvider IDLE', () => {
  it('stops notifying listeners after close and keeps disposal idempotent', async () => {
    const server = standardServer();
    const provider = await connectedProvider(server);
    const changes: MailboxChange[] = [];
    const dispose = await provider.idle('INBOX', (change) => changes.push(change));

    await provider.close();
    deliverMail(server, 'INBOX', { id: 'm1' });

    expect(changes).toEqual([]);
    expect(server.listeners.size).toBe(0);
    await expect(dispose()).resolves.toBeUndefined();
    await expect(dispose()).resolves.toBeUndefined();
  });

  it('keeps listeners of other providers when one provider closes', async () => {
    const server = standardServer();
    const closing = await connectedProvider(server);
    const staying = await connectedProvider(server);
    const changes: MailboxChange[] = [];
    await closing.idle('INBOX', () => undefined);
    await staying.idle('INBOX', (change) => changes.push(change));

    await closing.close();
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });

    expect(changes).toEqual([{ type: 'exists', mailboxPath: 'INBOX', count: uid }]);
  });

  it('emits a flags change when keywords change', async () => {
    const server = standardServer();
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });
    const provider = await connectedProvider(server);
    const changes: MailboxChange[] = [];
    await provider.idle('INBOX', (change) => changes.push(change));

    await provider.setKeywords('INBOX', [uid], { add: ['$Relay'], remove: [] });

    expect(server.record('INBOX', uid).keywords).toEqual(['$Relay']);
    expect(changes).toEqual([{ type: 'flags', mailboxPath: 'INBOX', uid }]);
  });
});
