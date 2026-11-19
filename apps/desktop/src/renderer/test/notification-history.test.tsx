// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { removeThreadFromLists } from '../src/data/hooks/thread-cache';
import { appHistory } from '../src/features/history/app-history';
import { selectFolder, selectScope } from '../src/features/mail/navigation';
import { INBOX } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import {
  expectAt,
  folderOf,
  heldThreads,
  personal,
  release,
  SENT,
  splitThreadOf,
  start,
  work,
} from './support/notification-history';
import { resetStores } from './support/render-app';

describe('history of a thread opened from a notification', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('goes back to the list of the thread and then to where the user was', async () => {
    const client = demoClient();
    const thread = await splitThreadOf(client, personal);
    expect(thread).toBeDefined();
    const { click } = await start(client);
    act(() => {
      selectScope(work);
      selectFolder(SENT);
    });

    click(thread?.id ?? demoIds.thread('none'));
    const folder = thread === undefined ? INBOX : folderOf(thread);
    expectAt(personal, folder, thread?.id ?? null);

    release(3);
    expectAt(personal, folder, null);
    release(3);
    expectAt(work, SENT, null);
    release(4);
    expectAt(personal, folder, null);
    release(4);
    expectAt(personal, folder, thread?.id ?? null);
  });

  it('reopens the settings the notification closed after the list of the thread', async () => {
    const client = demoClient();
    const thread = await splitThreadOf(client, personal);
    const { click } = await start(client);
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'look', adding: false } });
    });

    click(thread?.id ?? demoIds.thread('none'));
    expect(useUiStore.getState().overlay).toBeNull();
    release(3);
    expect(useUiStore.getState()).toMatchObject({ openThreadId: null, overlay: null });
    release(3);

    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'settings', section: 'look' });
  });

  it.each([
    ['the list the user was on', INBOX],
    ['another folder', SENT],
  ])(
    'records no entry when a thread unknown from %s is relocated later',
    async (_name, startFolder) => {
      const { base, client, held } = heldThreads();
      const thread = await splitThreadOf(base, personal);
      expect(thread).toBeDefined();
      const { queryClient, click } = await start(client);
      act(() => {
        selectScope(work);
        selectFolder(startFolder);
      });
      await settle();
      const threadId = thread?.id ?? demoIds.thread('none');
      removeThreadFromLists(queryClient, threadId);

      click(threadId);
      expectAt(work, INBOX, threadId);
      act(() => {
        held.open();
      });
      const folder = thread === undefined ? INBOX : folderOf(thread);
      await waitFor(() => {
        expectAt(personal, folder, threadId);
      });
      expect(appHistory.can('forward')).toBe(false);

      release(3);
      expectAt(personal, folder, null);
      release(3);
      expectAt(work, startFolder, null);
      release(4);
      release(4);
      expectAt(personal, folder, threadId);
    },
  );
});
