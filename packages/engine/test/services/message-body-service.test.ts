import type { MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, messageHeader, present } from '../support/fixtures';
import { historyDate, storedMessages } from '../support/history';
import { oldMailId, remoteOld, setupRemoteBodies, storedByHeader } from '../support/remote-bodies';
import { USER_ID } from '../support/test-engine';

const okBody = (index: number) => ({
  status: 'ok',
  textBody: `Telo starej správy ${String(index)}`,
  htmlBody: null,
});

describe('MessageBodyService', () => {
  it('returns a stored body as local without touching the server', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const fresh = storedByHeader(engine, 'fresh', 'INBOX');
    const connections = seeded.server.connections;

    await expect(engine.services.bodies.get(USER_ID, fresh.id)).resolves.toEqual({
      status: 'local',
      textBody: 'Čerstvá správa',
      htmlBody: null,
    });
    expect(seeded.server.connections).toBe(connections);
  });

  it('fetches a remote body once, caches it and never stores it', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 2);
    seeded.server.fetchedMessages.length = 0;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(okBody(2));
    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(okBody(2));

    expect(seeded.server.fetchedMessages).toEqual([{ path: 'Archive', uid: message.uid }]);
    expect(engine.db.tables.messages.get(message.id)).toMatchObject({
      bodyState: 'remote',
      textBody: null,
    });
  });

  it('shares one fetch between concurrent requests', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 1);
    seeded.server.fetchedMessages.length = 0;

    const results = await Promise.all([
      engine.services.bodies.get(USER_ID, message.id),
      engine.services.bodies.get(USER_ID, message.id),
      engine.services.bodies.get(USER_ID, message.id),
    ]);

    expect(results).toEqual([okBody(1), okBody(1), okBody(1)]);
    expect(seeded.server.fetchedMessages).toHaveLength(1);
  });

  it('reuses one lingering connection and closes it after a minute idle', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const connections = seeded.server.connections;

    await engine.services.bodies.get(USER_ID, remoteOld(engine, 0).id);
    engine.clock.advance(30_000);
    await engine.services.bodies.get(USER_ID, remoteOld(engine, 3).id);
    expect(seeded.server.connections).toBe(connections + 1);
    expect(seeded.server.openConnections).toBe(1);

    engine.clock.advance(59_000);
    await engine.timer.fire();
    expect(seeded.server.openConnections).toBe(1);
    engine.clock.advance(1_000);
    await engine.timer.fire();
    expect(seeded.server.openConnections).toBe(0);
    expect(engine.services.readSessions.openCount()).toBe(0);
    expect(engine.timer.intervals).toEqual([]);
  });

  it('reports offline when the server is unreachable and recovers later', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 4);
    seeded.server.failConnect = 'ECONNREFUSED';

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual({
      status: 'offline',
    });

    seeded.server.failConnect = null;
    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(okBody(4));
  });

  it('drops a broken lingering connection and reconnects on the next request', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    await engine.services.bodies.get(USER_ID, remoteOld(engine, 0).id);
    seeded.server.failOperations = 'Connection reset';

    await expect(engine.services.bodies.get(USER_ID, remoteOld(engine, 1).id)).resolves.toEqual({
      status: 'offline',
    });
    expect(seeded.server.openConnections).toBe(0);

    seeded.server.failOperations = null;
    await expect(engine.services.bodies.get(USER_ID, remoteOld(engine, 1).id)).resolves.toEqual(
      okBody(1),
    );
  });

  it('falls back to another copy of the message, else reports it gone', async () => {
    const { engine, seeded } = await setupRemoteBodies({}, ({ server }) => {
      deliverMail(server, 'Archive', {
        id: oldMailId(5),
        date: historyDate(6, 100),
        body: 'Telo starej správy 5',
      });
    });
    const copies = storedMessages(engine).filter(
      (message) => message.messageIdHeader === messageHeader(oldMailId(5)),
    );
    expect(copies.map((message) => message.bodyState)).toEqual(['remote', 'remote']);
    const [archived] = copies;
    const lonely = remoteOld(engine, 3);
    seeded.server.expunge('Archive', present(archived).uid);
    seeded.server.expunge('Archive', lonely.uid);

    await expect(engine.services.bodies.get(USER_ID, present(archived).id)).resolves.toEqual(
      okBody(5),
    );
    await expect(engine.services.bodies.get(USER_ID, lonely.id)).resolves.toEqual({
      status: 'gone',
    });
  });

  it('serves the body of a stored local copy without going online', async () => {
    const { engine, seeded } = await setupRemoteBodies({}, ({ server }) => {
      deliverMail(server, 'INBOX', { id: oldMailId(2), body: 'Telo starej správy 2' });
    });
    const remote = remoteOld(engine, 2);
    seeded.server.failConnect = 'ECONNREFUSED';

    await expect(engine.services.bodies.get(USER_ID, remote.id)).resolves.toEqual(okBody(2));
  });

  it('evicts the least recently used bodies beyond the byte budget', async () => {
    const bodyBytes = 2 * 'Telo starej správy 0'.length;
    const { engine, seeded } = await setupRemoteBodies({ cacheBytes: bodyBytes * 2 });
    const [first, second, third] = [0, 1, 2].map((index) => remoteOld(engine, index).id);
    const read = (id: MessageId | undefined) =>
      id === undefined ? Promise.resolve(null) : engine.services.bodies.get(USER_ID, id);
    await read(first);
    await read(second);
    await read(first);
    await read(third);
    seeded.server.fetchedMessages.length = 0;

    await read(first);
    await read(third);
    expect(seeded.server.fetchedMessages).toHaveLength(0);
    await read(second);
    expect(seeded.server.fetchedMessages).toHaveLength(1);
  });

  it('expires cached bodies after ten minutes', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 0);
    await engine.services.bodies.get(USER_ID, message.id);
    seeded.server.fetchedMessages.length = 0;

    engine.clock.advance(9 * 60_000);
    await engine.services.bodies.get(USER_ID, message.id);
    expect(seeded.server.fetchedMessages).toHaveLength(0);
    engine.clock.advance(60_000);
    await engine.services.bodies.get(USER_ID, message.id);
    expect(seeded.server.fetchedMessages).toHaveLength(1);
  });

  it('closes the lingering connection when the account is removed', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    await engine.services.bodies.get(USER_ID, remoteOld(engine, 0).id);
    expect(seeded.server.openConnections).toBe(1);

    await engine.services.accounts.remove(USER_ID, seeded.account.id);

    expect(seeded.server.openConnections).toBe(0);
  });

  it('rejects unknown messages', async () => {
    const { engine } = await setupRemoteBodies();

    await expect(
      engine.services.bodies.get(USER_ID, 'msg_missing' as MessageId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
