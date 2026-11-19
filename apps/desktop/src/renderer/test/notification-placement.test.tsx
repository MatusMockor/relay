// @vitest-environment jsdom
import type { AccountId, SplitId, ThreadSummary } from '@relay/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { findKnownThread, removeThreadFromLists } from '../src/data/hooks/thread-cache';
import type { MailClient } from '../src/data/MailClient';
import { backToList, selectScope } from '../src/features/mail/navigation';
import { INBOX } from '../src/state/folders';
import { useUiStore } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import { notifyingPlatform } from './support/notifying-platform';
import { renderApp, resetStores, testQueryClient } from './support/render-app';

const SCOPE_KEY = 'relay.scope';

const work = demoIds.account('efa');
const personal = demoIds.account('os');

const threadOfAccount = async (
  client: MailClient,
  accountId: AccountId,
  splitId?: SplitId,
): Promise<ThreadSummary | undefined> =>
  (await client.listThreads({ view: 'inbox', accountId, splitId })).items[0];

const splitThreadOfAccount = async (
  client: MailClient,
  accountId: AccountId,
): Promise<ThreadSummary | undefined> => {
  for (const split of await client.listSplits()) {
    const thread = await threadOfAccount(client, accountId, split.id);
    if (thread !== undefined) {
      return thread;
    }
  }
  return undefined;
};

const folderOf = (thread: ThreadSummary) => {
  const [splitId] = thread.splitIds;
  return splitId === undefined ? INBOX : { kind: 'inbox', splitId };
};

const backFromThread = () => {
  act(() => {
    backToList();
  });
};

describe('placing a notification thread in its account', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('switches the scope to the account of the thread so back returns to its list', async () => {
    const client = demoClient();
    const thread = await threadOfAccount(client, personal);
    expect(thread).toBeDefined();
    if (thread === undefined) {
      return;
    }
    const { platform, click } = notifyingPlatform();
    renderApp({ platform, demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      selectScope(work);
    });
    click(thread.id);
    expect(useUiStore.getState()).toMatchObject({ scope: personal, openThreadId: thread.id });
    backFromThread();
    expect(useUiStore.getState()).toMatchObject({
      scope: personal,
      folder: folderOf(thread),
      openThreadId: null,
    });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    expect(await within(list).findByText(thread.subject)).toBeTruthy();
  });

  it('keeps all accounts in scope when the user views all of them', async () => {
    const client = demoClient();
    const thread = await threadOfAccount(client, personal);
    expect(thread).toBeDefined();
    if (thread === undefined) {
      return;
    }
    const { platform, click } = notifyingPlatform();
    renderApp({ platform, demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    click(thread.id);
    backFromThread();
    expect(useUiStore.getState()).toMatchObject({
      scope: 'all',
      folder: folderOf(thread),
      openThreadId: null,
    });
  });

  const openedUncached = async () => {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(work));
    const client = demoClient();
    const thread = await splitThreadOfAccount(client, personal);
    expect(thread).toBeDefined();
    const queryClient = testQueryClient();
    const notifying = notifyingPlatform();
    renderApp({ platform: notifying.platform, demo: () => client, queryClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await settle();
    expect(useUiStore.getState().scope).toBe(work);
    if (thread !== undefined) {
      removeThreadFromLists(queryClient, thread.id);
      expect(findKnownThread(queryClient, thread.id)).toBeNull();
    }
    return { thread, click: notifying.click };
  };

  it('relocates a thread missing from the loaded lists once it is fetched', async () => {
    const { thread, click } = await openedUncached();
    if (thread === undefined) {
      return;
    }
    click(thread.id);
    expect(useUiStore.getState()).toMatchObject({ openThreadId: thread.id });
    await waitFor(() => {
      expect(useUiStore.getState()).toMatchObject({
        scope: personal,
        folder: folderOf(thread),
        openThreadId: thread.id,
      });
    });
    backFromThread();
    expect(useUiStore.getState()).toMatchObject({
      scope: personal,
      folder: folderOf(thread),
      openThreadId: null,
    });
  });

  it('leaves the list alone when the user closed the thread before it loaded', async () => {
    const { thread, click } = await openedUncached();
    if (thread === undefined) {
      return;
    }
    click(thread.id);
    backFromThread();
    await settle();
    expect(useUiStore.getState()).toMatchObject({
      scope: work,
      folder: INBOX,
      openThreadId: null,
    });
  });
});
