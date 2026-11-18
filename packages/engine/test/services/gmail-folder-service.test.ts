import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src';
import { present } from '../support/fixtures';
import { gmailFolders, roleFolder, storedFolder, syncFolders } from '../support/folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const gmailLabels = async (engine: TestEngine): Promise<Label[]> =>
  engine.repositories.labels.list(USER_ID, null);

const labelNamed = async (engine: TestEngine, name: string): Promise<Label> =>
  present((await gmailLabels(engine)).find((label) => label.name === name));

describe('FolderService on Gmail labels', () => {
  it('creates a nested label mailbox together with its Gmail label', async () => {
    const engine = createTestEngine();
    const seeded = await gmailFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Klienti');

    const created = await engine.services.folders.create(USER_ID, seeded.account.id, {
      name: 'Beta',
      parentId: parent.id,
    });

    expect(created).toMatchObject({ path: 'Klienti/Beta', role: 'label' });
    expect(await labelNamed(engine, 'Klienti/Beta')).toMatchObject({
      kind: 'gmail',
      remoteName: 'Klienti/Beta',
    });
    expect(
      engine.events
        .ofType('labels.updated')
        .at(-1)
        ?.data.labels.map((l) => l.name),
    ).toContain('Klienti/Beta');
  });

  it('renames a label tree and keeps the label ids', async () => {
    const engine = createTestEngine();
    const seeded = await gmailFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Klienti');
    const acme = await labelNamed(engine, 'Klienti/Acme');
    const thread = present([...engine.db.tables.threads.values()][0]);

    await engine.services.folders.update(USER_ID, parent.id, { name: 'Zákazníci' });
    await syncFolders(engine, seeded);

    expect(seeded.server.folderCommands).toEqual(['RENAME Klienti Zákazníci']);
    expect(await labelNamed(engine, 'Zákazníci/Acme')).toMatchObject({
      id: acme.id,
      remoteName: 'Zákazníci/Acme',
    });
    expect((await storedFolder(engine, seeded, 'Zákazníci')).id).toBe(parent.id);
    expect(present(engine.db.tables.threads.get(thread.id)).labelIds).toEqual([acme.id]);
  });

  it('deletes a label but keeps its mail in All Mail', async () => {
    const engine = createTestEngine();
    const seeded = await gmailFolders(engine);
    const leaf = await storedFolder(engine, seeded, 'Klienti/Acme');
    const thread = present([...engine.db.tables.threads.values()][0]);

    await engine.services.folders.remove(USER_ID, leaf.id);

    expect(seeded.server.folderCommands).toEqual(['DELETE Klienti/Acme']);
    expect(seeded.server.mailbox('Archive').messages.size).toBe(1);
    expect((await gmailLabels(engine)).map((label) => label.name)).toEqual(['Klienti']);
    expect(present(engine.db.tables.threads.get(thread.id)).labelIds).toEqual([]);
    const upserted = engine.events.ofType('thread.upserted').at(-1)?.data.thread;
    expect(upserted).toMatchObject({ id: thread.id, labelIds: [] });
    expect(engine.events.ofType('labels.updated')).not.toHaveLength(0);
  });

  it('protects the Gmail system folders', async () => {
    const engine = createTestEngine();
    const seeded = await gmailFolders(engine);
    const archive = await roleFolder(engine, seeded, 'archive');

    await expect(engine.services.folders.remove(USER_ID, archive.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      engine.services.folders.create(USER_ID, seeded.account.id, {
        name: '[Gmail]',
        parentId: null,
      }),
    ).rejects.toThrow('vyhradený');
  });
});
