import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('threads carrying a label in Postgres', () => {
  const context = usePgTestContext();

  it('lists each labelled thread once and nothing after the label is deleted', async () => {
    const seeded = await seedAccount(context.repositories);
    const label: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktúry',
    };
    await context.repositories.labels.upsert(label);
    const first = await seedThread(
      context.repositories,
      seeded,
      {},
      { uid: 1, labelIds: [label.id] },
    );
    await context.repositories.messages.upsert(
      { ...first.message, id: newId('message'), uid: 2, messageIdHeader: '<second@x>' },
      new Map(),
    );
    const second = await seedThread(
      context.repositories,
      seeded,
      {},
      { uid: 3, labelIds: [label.id] },
    );
    await seedThread(context.repositories, seeded, {}, { uid: 4 });
    const { labels, messages, threads } = context.repositories;

    expect([...(await messages.listThreadIdsByLabel(label.id))].sort()).toEqual(
      [first.thread.id, second.thread.id].sort(),
    );

    await labels.delete(seeded.user.id, label.id);

    expect(await messages.listThreadIdsByLabel(label.id)).toEqual([]);
    const thread = await threads.findById(seeded.user.id, first.thread.id);
    expect(thread?.labelIds).toEqual([]);
  });
});
