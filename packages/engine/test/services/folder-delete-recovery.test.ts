import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import {
  FOLDER_DATE,
  folderThreads,
  imapFolders,
  storedFolder,
  syncFolders,
} from '../support/folders';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('deleting a plain IMAP folder in unusual server states', () => {
  it('checks the folder with a fresh UID search right before DELETE', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');

    await engine.services.folders.remove(USER_ID, child.id);

    expect(seeded.server.uidListings.at(-1)).toBe('fresh:Projekty/Alfa');
    expect(seeded.server.folderCommands).toEqual(['DELETE Projekty/Alfa']);
  });

  it('keeps cached rows out of Trash when the folder UIDVALIDITY changed since the sync', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Alfa', 'custom', 301);
    deliverMail(seeded.server, 'Alfa', { id: 'a1', subject: 'Prvý', date: FOLDER_DATE });
    deliverMail(seeded.server, 'Alfa', { id: 'a2', subject: 'Druhý', date: FOLDER_DATE });
    await syncFolders(engine, seeded);
    const folder = await storedFolder(engine, seeded, 'Alfa');
    seeded.server.expunge('Alfa', 1);
    seeded.server.resetUidValidity('Alfa');

    await engine.services.folders.remove(USER_ID, folder.id);
    await syncFolders(engine, seeded);

    expect(seeded.server.mailbox('Trash').messages.size).toBe(1);
    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 20 });
    expect(trash.items.map((thread) => thread.subject)).toEqual(['Druhý']);
    const subjects = [...engine.db.tables.threads.values()].map((thread) => thread.subject);
    expect(subjects).not.toContain('Prvý');
  });

  it('refreshes the moved threads when the server fails after the move', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    const [threadId] = await folderThreads(engine, child);
    seeded.server.afterMove = () => {
      seeded.server.failOperations = 'Server is busy';
      seeded.server.afterMove = null;
    };

    await expect(engine.services.folders.remove(USER_ID, child.id)).rejects.toThrow(
      'Server is busy',
    );

    seeded.server.failOperations = null;
    expect(present(engine.db.tables.threads.get(present(threadId))).state).toBe('trash');
    expect(seeded.server.mailbox('Trash').messages.size).toBe(1);
    expect(seeded.server.find('Projekty/Alfa')).not.toBeNull();
    expect(await engine.repositories.mailboxes.findById(child.id)).not.toBeNull();
    expect(engine.events.ofType('thread.upserted').at(-1)?.data.thread).toMatchObject({
      id: threadId,
      state: 'trash',
    });
  });
});
