import type { AccountId, ThreadSummary } from '@relay/shared';
import { act, fireEvent, screen } from '@testing-library/react';
import { expect } from 'vitest';
import { demoIds } from '../../src/data/demo/seed/ids';
import type { MailClient } from '../../src/data/MailClient';
import { type Folder, INBOX } from '../../src/state/folders';
import { useUiStore } from '../../src/state/ui-store';
import { removeThreadFromLists } from '../../src/data/hooks/thread-cache';
import { selectFolder, selectScope } from '../../src/features/mail/navigation';
import { demoClient, gate, settle } from '../features-support';
import { notifyingPlatform } from './notifying-platform';
import { renderApp, testQueryClient } from './render-app';

export const work = demoIds.account('efa');
export const personal = demoIds.account('os');
export const SENT: Folder = { kind: 'view', view: 'sent' };

export const release = (button: number): void => {
  act(() => {
    fireEvent.mouseUp(window, { button });
  });
};

export const splitThreads = async (
  client: MailClient,
  accountId?: AccountId,
): Promise<ThreadSummary[]> => {
  const lists = await Promise.all(
    (await client.listSplits()).map((split) =>
      client.listThreads({ view: 'inbox', accountId, splitId: split.id }),
    ),
  );
  return lists.flatMap((list) => list.items);
};

export const splitThreadOf = async (client: MailClient, accountId: AccountId) =>
  (await splitThreads(client, accountId))[0];

export const folderOf = (thread: ThreadSummary): Folder => {
  const [splitId] = thread.splitIds;
  return splitId === undefined ? INBOX : { kind: 'inbox', splitId };
};

export const expectAt = (scope: AccountId | 'all', folder: Folder, openThreadId: string | null) => {
  expect(useUiStore.getState()).toMatchObject({ scope, folder, openThreadId });
};

export const start = async (client: MailClient) => {
  const queryClient = testQueryClient();
  const notifying = notifyingPlatform();
  renderApp({ platform: notifying.platform, demo: () => client, queryClient });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return { queryClient, click: notifying.click };
};

export const heldThreads = () => {
  const base = demoClient();
  const held = gate();
  const client: MailClient = {
    ...base,
    getThread: (threadId) => held.wait().then(() => base.getThread(threadId)),
  };
  return { base, client, held };
};

export const uncachedNotification = async (
  scope: AccountId | 'all',
  folder: (thread: Folder) => Folder,
) => {
  const { base, client, held } = heldThreads();
  const thread = await splitThreadOf(base, personal);
  expect(thread).toBeDefined();
  const threadId = thread?.id ?? demoIds.thread('none');
  const placed = thread === undefined ? INBOX : folderOf(thread);
  const { queryClient, click } = await start(client);
  act(() => {
    selectScope(scope);
    selectFolder(folder(placed));
  });
  await settle();
  removeThreadFromLists(queryClient, threadId);
  return {
    threadId,
    folder: placed,
    click: () => {
      click(threadId);
    },
    load: async () => {
      act(() => {
        held.open();
      });
      await settle();
    },
  };
};
