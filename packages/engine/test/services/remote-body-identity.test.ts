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

const GONE = { status: 'gone' };

const copyInSent = (index: number) =>
  setupRemoteBodies({}, ({ server }) => {
    deliverMail(server, 'Sent', {
      id: oldMailId(index),
      date: historyDate(index, 100),
      body: `Telo starej správy ${String(index)}`,
    });
  });

describe('MessageBodyService identity and missing mailboxes', () => {
  it('refuses a body at the same UID after a UIDVALIDITY reset when the Message-ID is unknown', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 1);
    engine.db.tables.messages.set(message.id, { ...message, messageIdHeader: null });
    seeded.server.resetUidValidity('Archive');
    const archive = present(seeded.server.find('Archive'));
    const other = present(archive.messages.get(message.uid + 1));
    archive.messages.set(message.uid, { ...other, uid: message.uid });
    seeded.server.fetchedMessages.length = 0;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(GONE);
    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(GONE);
    expect(seeded.server.fetchedMessages).toEqual([]);
  });

  it('serves a body without a Message-ID while the UIDVALIDITY still matches', async () => {
    const { engine } = await setupRemoteBodies();
    const message = remoteOld(engine, 2);
    engine.db.tables.messages.set(message.id, { ...message, messageIdHeader: null });

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(okBody(2));
  });

  it('treats a mailbox without a stored sync state as gone without connecting', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 3);
    engine.db.tables.syncStates.delete(message.mailboxId);
    const connections = seeded.server.connections;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(GONE);
    expect(seeded.server.connections).toBe(connections);
  });

  it('falls back to a copy in another folder when the mailbox was deleted on the server', async () => {
    const { engine, seeded } = await copyInSent(4);
    const copies = storedMessages(engine).filter(
      (message) => message.messageIdHeader === messageHeader(oldMailId(4)),
    );
    expect(copies.map((message) => message.bodyState)).toEqual(['remote', 'remote']);
    const archived = storedByHeader(engine, oldMailId(4), 'Archive');
    seeded.server.removeMailbox('Archive');

    await expect(engine.services.bodies.get(USER_ID, archived.id)).resolves.toEqual(okBody(4));
    expect(seeded.server.openConnections).toBe(1);
  });

  it('reports a message in a deleted mailbox without other copies as gone, not offline', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const message = remoteOld(engine, 0);
    seeded.server.removeMailbox('Archive');

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(GONE);
  });

  it('tries the next copy when a reachable server refuses to fetch one UID', async () => {
    const { engine, seeded } = await copyInSent(5);
    const archived = storedByHeader(engine, oldMailId(5), 'Archive');
    seeded.server.failFetchUid = archived.uid;

    await expect(engine.services.bodies.get(USER_ID, archived.id)).resolves.toEqual(okBody(5));
  });
});
