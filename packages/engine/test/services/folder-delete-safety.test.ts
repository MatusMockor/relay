import { describe, expect, it } from 'vitest';
import { ForbiddenError, ProviderError } from '../../src';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import {
  FOLDER_DATE,
  folderThreads,
  imapFolders,
  storedFolder,
  syncFolders,
} from '../support/folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const remove = (
  engine: TestEngine,
  mailboxId: Parameters<TestEngine['services']['folders']['remove']>[1],
) => engine.services.folders.remove(USER_ID, mailboxId);

describe('deleting a plain IMAP folder never loses mail', () => {
  it('moves every message on the server to Trash, also the ones Relay never cached', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Archív 2020', 'custom', 401);
    for (let index = 0; index < 201; index += 1) {
      deliverMail(seeded.server, 'Archív 2020', { id: `old-${String(index)}`, date: FOLDER_DATE });
    }
    await syncFolders(engine, seeded);
    const folder = await storedFolder(engine, seeded, 'Archív 2020');
    expect(await engine.repositories.messages.listUids(folder.id)).toHaveLength(200);

    await remove(engine, folder.id);

    expect(seeded.server.find('Archív 2020')).toBeNull();
    expect(seeded.server.mailbox('Trash').messages.size).toBe(201);
    await syncFolders(engine, seeded);
    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 300 });
    expect(trash.items).toHaveLength(201);
  });

  it('moves mail that arrives while the folder is being emptied', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    let arrivals = 0;
    seeded.server.afterMove = (path) => {
      if (path !== 'Projekty/Alfa' || arrivals > 0) {
        return;
      }
      arrivals += 1;
      deliverMail(seeded.server, 'Projekty/Alfa', { id: 'late', date: FOLDER_DATE });
    };

    await remove(engine, child.id);

    expect(seeded.server.find('Projekty/Alfa')).toBeNull();
    expect(seeded.server.mailbox('Trash').messages.size).toBe(2);
  });

  it('keeps the folder when new mail keeps arriving', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    let arrivals = 0;
    seeded.server.afterMove = (path) => {
      arrivals += 1;
      deliverMail(seeded.server, path, { id: `busy-${String(arrivals)}`, date: FOLDER_DATE });
    };

    await expect(remove(engine, child.id)).rejects.toBeInstanceOf(ProviderError);

    expect(seeded.server.folderCommands).toEqual([]);
    const total =
      seeded.server.mailbox('Projekty/Alfa').messages.size +
      seeded.server.mailbox('Trash').messages.size;
    expect(total).toBe(1 + arrivals);
    expect(await engine.repositories.mailboxes.findById(child.id)).not.toBeNull();
  });

  it('keeps the folder when a move ends in an unknown state', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    const [threadId] = await folderThreads(engine, child);
    seeded.server.partialMoves = true;

    await expect(remove(engine, child.id)).rejects.toBeInstanceOf(ProviderError);

    expect(seeded.server.folderCommands).toEqual([]);
    expect(seeded.server.mailbox('Projekty/Alfa').messages.size).toBe(1);
    expect(await engine.repositories.mailboxes.findById(child.id)).not.toBeNull();
    expect(await folderThreads(engine, child)).toEqual([present(threadId)]);
  });
});

describe('protected mailboxes inside a custom folder', () => {
  it('refuses to rename or move a folder that holds a role mailbox', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Firma', 'custom', 501);
    seeded.server.addMailbox('Firma/Odoslané', 'sent', 502);
    await syncFolders(engine, seeded);
    const parent = await storedFolder(engine, seeded, 'Firma');
    const other = await engine.services.folders.create(USER_ID, seeded.account.id, {
      name: 'Iné',
      parentId: null,
    });
    const { folders } = engine.services;

    await expect(folders.update(USER_ID, parent.id, { name: 'Práca' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(folders.update(USER_ID, parent.id, { parentId: other.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(seeded.server.folderCommands).toEqual(['CREATE Iné']);
  });

  it('refuses to rename a folder whose protected child is only on the server', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Projekty');
    seeded.server.addMailbox('Projekty/Kôš', 'trash');

    await expect(
      engine.services.folders.update(USER_ID, parent.id, { name: 'Klienti' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(seeded.server.find('Projekty')).not.toBeNull();
  });
});
