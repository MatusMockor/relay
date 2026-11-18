import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { buildMailbox, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const TREE = ['😀 Projekty', '😀 Projekty.Alfa', '😀 Projekty.Alfa.Q1', '😀 ProjektyX', 'Iné'];

describe('PgMailboxRepository.relocateTree', () => {
  const context = usePgTestContext();

  const addTree = (owner: AccountId) =>
    context.repositories.mailboxes.upsertMany(
      owner,
      TREE.map((path) =>
        buildMailbox(owner, 'custom', {
          path,
          name: path.split('.').pop() ?? path,
          delimiter: '.',
        }),
      ),
    );

  const folders = async (owner: AccountId) =>
    (await context.repositories.mailboxes.listForSync(owner))
      .filter((mailbox) => mailbox.role === 'custom')
      .map(({ id, path, name }) => ({ id, path, name }));

  it('moves the folder and every descendant and keeps their ids', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories);
    const before = await addTree(seeded.account.id);
    await addTree(other.account.id);
    const idOf = (path: string) => before.find((mailbox) => mailbox.path === path)?.id;

    await context.repositories.mailboxes.relocateTree(seeded.account.id, '😀 Projekty', {
      path: 'Archív.Klienti',
      name: 'Klienti',
      delimiter: '.',
    });

    const after = await folders(seeded.account.id);
    expect(new Set(after)).toEqual(
      new Set([
        { id: idOf('😀 Projekty'), path: 'Archív.Klienti', name: 'Klienti' },
        { id: idOf('😀 Projekty.Alfa'), path: 'Archív.Klienti.Alfa', name: 'Alfa' },
        { id: idOf('😀 Projekty.Alfa.Q1'), path: 'Archív.Klienti.Alfa.Q1', name: 'Q1' },
        { id: idOf('😀 ProjektyX'), path: '😀 ProjektyX', name: '😀 ProjektyX' },
        { id: idOf('Iné'), path: 'Iné', name: 'Iné' },
      ]),
    );
    expect((await folders(other.account.id)).map(({ path }) => path).sort()).toEqual(
      [...TREE].sort(),
    );
  });
});
