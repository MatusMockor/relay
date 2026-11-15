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

describe('FakeMailProvider UIDVALIDITY', () => {
  it('fails fetchSince with a stale cursor instead of refetching under the old checkpoint', async () => {
    const server = standardServer();
    deliverMail(server, 'INBOX', { id: 'm1' });
    const provider = await connectedProvider(server);
    const cursor = { uidValidity: 1, lastUid: 0, highestModseq: null };
    server.resetUidValidity('INBOX');

    await expect(collect<RawMessage>(provider.fetchSince('INBOX', cursor))).rejects.toThrow(
      /UIDVALIDITY of INBOX changed/,
    );
  });
});

describe('FakeMailProvider stores', () => {
  it('applies flags to every surviving UID and ignores missing ones like UID STORE', async () => {
    const server = standardServer();
    const first = deliverMail(server, 'INBOX', { id: 'm1' });
    const second = deliverMail(server, 'INBOX', { id: 'm2' });
    const provider = await connectedProvider(server);

    await provider.setFlags('INBOX', [first, 999, second], { add: ['seen'], remove: [] });

    expect(server.record('INBOX', first).flags.seen).toBe(true);
    expect(server.record('INBOX', second).flags.seen).toBe(true);
  });

  it('applies keywords to every surviving UID and ignores missing ones like UID STORE', async () => {
    const server = standardServer();
    const first = deliverMail(server, 'INBOX', { id: 'm1' });
    const second = deliverMail(server, 'INBOX', { id: 'm2' });
    const provider = await connectedProvider(server);

    await provider.setKeywords('INBOX', [first, 999, second], { add: ['$Relay'], remove: [] });

    expect(server.record('INBOX', first).keywords).toEqual(['$Relay']);
    expect(server.record('INBOX', second).keywords).toEqual(['$Relay']);
  });
});

describe('FakeMailServer message bytes', () => {
  it('keeps stored bytes independent from the delivered and the fetched buffers', async () => {
    const server = standardServer();
    const source = new TextEncoder().encode('Subject: original\r\n\r\nbody');
    const uid = server.deliver('INBOX', source);
    source.fill(0);
    const provider = await connectedProvider(server);

    const fetched = await provider.fetchMessage('INBOX', uid);
    fetched?.source.fill(0);
    const again = await provider.fetchMessage('INBOX', uid);

    expect(new TextDecoder().decode(again?.source)).toContain('Subject: original');
  });
});

describe('FakeMailServer HIGHESTMODSEQ', () => {
  it('never lowers the HIGHESTMODSEQ of a mailbox and bumps it on expunge', async () => {
    const server = standardServer();
    deliverMail(server, 'INBOX', { id: 'm1' });
    const latest = deliverMail(server, 'INBOX', { id: 'm2' });
    const provider = await connectedProvider(server);
    const before = BigInt((await provider.status('INBOX')).highestModseq ?? '0');

    server.expunge('INBOX', latest);
    const after = BigInt((await provider.status('INBOX')).highestModseq ?? '0');

    expect(after).toBeGreaterThan(before);
  });
});
