import type { MailboxRole } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ProviderError, ValidationError } from '../../src';
import { present, seedAccount } from '../support/fixtures';
import {
  folderThreads,
  imapFolders,
  roleFolder,
  storedFolder,
  syncFolders,
} from '../support/folders';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('FolderService on plain IMAP', () => {
  it('creates a top-level folder and a subfolder under it', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const folders = engine.services.folders;

    const top = await folders.create(USER_ID, seeded.account.id, {
      name: ' Faktúry ',
      parentId: null,
    });
    const nested = await folders.create(USER_ID, seeded.account.id, {
      name: '2026',
      parentId: top.id,
    });

    expect(top).toMatchObject({ path: 'Faktúry', name: 'Faktúry', role: 'custom' });
    expect(nested).toMatchObject({ path: 'Faktúry/2026', role: 'custom', uidValidity: 1 });
    expect(seeded.server.folderCommands).toEqual(['CREATE Faktúry', 'CREATE Faktúry/2026']);
    expect(await storedFolder(engine, seeded, 'Faktúry/2026')).toEqual(nested);
    const updates = engine.events.ofType('mailboxes.updated');
    expect(updates.at(-1)?.data.mailboxes.map((mailbox) => mailbox.path)).toContain('Faktúry/2026');
  });

  it('rejects names that clash with a sibling or break the hierarchy', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const projects = await storedFolder(engine, seeded, 'Projekty');
    const create = (name: string, parentId: typeof projects.id | null = null) =>
      engine.services.folders.create(USER_ID, seeded.account.id, { name, parentId });

    await expect(create('projekty')).rejects.toBeInstanceOf(ConflictError);
    await expect(create('ALFA', projects.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(create('a/b')).rejects.toBeInstanceOf(ValidationError);
    await expect(create('a*')).rejects.toBeInstanceOf(ValidationError);
    await expect(create('100%')).rejects.toBeInstanceOf(ValidationError);
    await expect(create('inbox')).rejects.toBeInstanceOf(ValidationError);
    await expect(create('   ')).rejects.toBeInstanceOf(ValidationError);
    expect(seeded.server.folderCommands).toEqual([]);
  });

  it.each<MailboxRole>(['inbox', 'sent', 'archive', 'trash', 'spam', 'drafts', 'system'])(
    'refuses to change the %s mailbox',
    async (role) => {
      const engine = createTestEngine();
      const seeded = await seedAccount(engine);
      seeded.server.addMailbox('Junk', 'spam');
      seeded.server.addMailbox('Drafts', 'drafts');
      seeded.server.addMailbox('Flagged', 'system');
      await syncFolders(engine, seeded);
      const mailbox = await roleFolder(engine, seeded, role);
      const { folders } = engine.services;

      await expect(folders.update(USER_ID, mailbox.id, { name: 'X' })).rejects.toThrow(
        new ForbiddenError('Systémový priečinok nie je možné upraviť'),
      );
      await expect(folders.remove(USER_ID, mailbox.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        folders.create(USER_ID, seeded.account.id, { name: 'X', parentId: mailbox.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(seeded.server.folderCommands).toEqual([]);
    },
  );

  it('renames a folder with its subfolders and keeps ids, mail and sync state', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Projekty');
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    const [threadId] = await folderThreads(engine, child);
    const streamed = seeded.server.streamedMessages.length;

    const renamed = await engine.services.folders.update(USER_ID, parent.id, { name: 'Klienti' });
    await syncFolders(engine, seeded);

    expect(renamed).toMatchObject({ id: parent.id, path: 'Klienti', name: 'Klienti' });
    expect(await storedFolder(engine, seeded, 'Klienti/Alfa')).toMatchObject({
      id: child.id,
      uidValidity: 302,
    });
    expect(await folderThreads(engine, child)).toEqual([present(threadId)]);
    expect(seeded.server.streamedMessages).toHaveLength(streamed);
    expect(seeded.server.folderCommands).toEqual(['RENAME Projekty Klienti']);
  });

  it('moves a folder under another one and back to the top level', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Projekty');
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    const archive = await engine.services.folders.create(USER_ID, seeded.account.id, {
      name: 'Staré',
      parentId: null,
    });
    const { folders } = engine.services;

    expect(await folders.update(USER_ID, child.id, { parentId: archive.id })).toMatchObject({
      id: child.id,
      path: 'Staré/Alfa',
    });
    expect(await folders.update(USER_ID, child.id, { parentId: null })).toMatchObject({
      path: 'Alfa',
    });
    await expect(
      folders.update(USER_ID, archive.id, { parentId: archive.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await folders.update(USER_ID, parent.id, { name: 'Projekty' })).path).toBe('Projekty');
  });

  it('moves the mail of a deleted folder to Trash before deleting it', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    const [threadId] = await folderThreads(engine, child);

    await engine.services.folders.remove(USER_ID, child.id);

    expect(seeded.server.find('Projekty/Alfa')).toBeNull();
    expect(seeded.server.mailbox('Trash').messages.size).toBe(1);
    expect(seeded.server.folderCommands).toEqual(['DELETE Projekty/Alfa']);
    expect(await engine.repositories.mailboxes.findById(child.id)).toBeNull();
    const thread = present(engine.db.tables.threads.get(present(threadId)));
    expect(thread.state).toBe('trash');
    await syncFolders(engine, seeded);
    expect(present(engine.db.tables.threads.get(thread.id)).state).toBe('trash');

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });
    expect(restored.state).toBe('inbox');
    expect(seeded.server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('refuses to delete a folder that has subfolders', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Projekty');

    await expect(engine.services.folders.remove(USER_ID, parent.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(seeded.server.folderCommands).toEqual([]);
  });

  it('keeps the folder and its mail when the server fails', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    const child = await storedFolder(engine, seeded, 'Projekty/Alfa');
    seeded.server.failOperations = 'Server is busy';
    const failing = engine.services.folders.remove(USER_ID, child.id);

    await expect(failing).rejects.toThrow('Server is busy');
    seeded.server.failOperations = null;
    expect(seeded.server.mailbox('Projekty/Alfa').messages.size).toBe(1);
    expect(await engine.repositories.pendingWork.list(seeded.account.id, 'provider-op')).toEqual(
      [],
    );
    expect(await engine.repositories.pendingWork.list(seeded.account.id, 'trash-origin')).toEqual(
      [],
    );
    expect(await engine.repositories.mailboxes.findById(child.id)).not.toBeNull();
  });

  it('fails with a provider error while the mail server is unreachable', async () => {
    const engine = createTestEngine();
    const seeded = await imapFolders(engine);
    seeded.server.failConnect = 'Network is down';

    await expect(
      engine.services.folders.create(USER_ID, seeded.account.id, { name: 'Nový', parentId: null }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
