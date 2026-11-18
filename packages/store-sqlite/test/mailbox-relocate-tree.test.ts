import type { AccountId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountId, buildMailbox, mailboxId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const TREE = ['😀 Projekty', '😀 Projekty.Alfa', '😀 Projekty.Alfa.Q1', '😀 ProjektyX', 'Iné'];

describe('SqliteMailboxRepository.relocateTree', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  const addTree = (owner: AccountId) =>
    store.repositories.mailboxes.upsertMany(
      owner,
      TREE.map((path, index) =>
        buildMailbox({
          id: mailboxId(`${owner}-f${String(index)}`),
          accountId: owner,
          name: path.split('.').pop() ?? path,
          path,
          delimiter: '.',
          role: 'custom',
        }),
      ),
    );

  const paths = async (owner: AccountId) =>
    (await store.repositories.mailboxes.listForSync(owner))
      .filter((mailbox) => mailbox.role === 'custom')
      .map(({ id, path, name }) => ({ id, path, name }))
      .sort((left, right) => left.id.localeCompare(right.id));

  it('moves the folder and every descendant and keeps their ids', async () => {
    const other = await seedAccount(store.repositories, {
      id: accountId('acc-2'),
      email: 'eva@firma.sk',
    });
    await addTree(work.account.id);
    await addTree(other.account.id);

    await store.repositories.mailboxes.relocateTree(work.account.id, '😀 Projekty', {
      path: 'Archív.Klienti',
      name: 'Klienti',
      delimiter: '.',
    });

    const owner = work.account.id;
    expect(await paths(owner)).toEqual([
      { id: mailboxId(`${owner}-f0`), path: 'Archív.Klienti', name: 'Klienti' },
      { id: mailboxId(`${owner}-f1`), path: 'Archív.Klienti.Alfa', name: 'Alfa' },
      { id: mailboxId(`${owner}-f2`), path: 'Archív.Klienti.Alfa.Q1', name: 'Q1' },
      { id: mailboxId(`${owner}-f3`), path: '😀 ProjektyX', name: '😀 ProjektyX' },
      { id: mailboxId(`${owner}-f4`), path: 'Iné', name: 'Iné' },
    ]);
    expect((await paths(other.account.id)).map(({ path }) => path).sort()).toEqual(
      [...TREE].sort(),
    );
  });
});
