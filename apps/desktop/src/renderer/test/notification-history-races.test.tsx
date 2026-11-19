// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openThread, selectFolder } from '../src/features/mail/navigation';
import { INBOX } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import type { ThreadSummary } from '@relay/shared';
import { removeThreadFromLists } from '../src/data/hooks/thread-cache';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { type Gate, gate } from './support/gate';
import {
  expectAt,
  folderOf,
  personal,
  release,
  SENT,
  splitThreadOf,
  splitThreads,
  start,
  uncachedNotification,
  work,
} from './support/notification-history';
import { resetStores } from './support/render-app';

const openSettings = (): void => {
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'look', adding: false } });
  });
};

describe('history of a notification thread while other things happen', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('leaves the settings opened before the thread loaded alone', async () => {
    const opened = await uncachedNotification(work, () => SENT);
    opened.click();
    openSettings();

    await opened.load();
    expectAt(work, INBOX, opened.threadId);
    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'settings' });

    release(3);
    expectAt(personal, opened.folder, opened.threadId);
    expect(useUiStore.getState().overlay).toBeNull();
    release(3);
    expectAt(personal, opened.folder, null);
    release(3);
    expectAt(work, SENT, null);
  });

  it('corrects the list and the thread when going back before the thread loaded', async () => {
    const opened = await uncachedNotification(work, () => SENT);
    opened.click();
    release(3);
    expectAt(work, INBOX, null);

    await opened.load();
    expectAt(personal, opened.folder, null);
    release(4);
    expectAt(personal, opened.folder, opened.threadId);
    release(3);
    release(3);
    expectAt(work, SENT, null);
  });

  it('shows the list once when the thread belongs to the list the user is on', async () => {
    const opened = await uncachedNotification(personal, (folder) => folder);
    opened.click();
    await opened.load();
    expectAt(personal, opened.folder, opened.threadId);

    release(3);
    expectAt(personal, opened.folder, null);
    release(3);
    expectAt(personal, INBOX, null);
  });

  it('closes the settings over the thread the notification is for', async () => {
    const client = demoClient();
    const thread = await splitThreadOf(client, personal);
    expect(thread).toBeDefined();
    if (thread === undefined) {
      return;
    }
    const { click } = await start(client);
    act(() => {
      selectFolder(folderOf(thread));
      openThread(thread.id);
    });
    await settle();
    openSettings();

    click(thread.id);
    expect(useUiStore.getState().overlay).toBeNull();
    expectAt('all', folderOf(thread), thread.id);
    release(3);

    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'settings' });
    expectAt('all', folderOf(thread), thread.id);
  });

  it('records the list once when the command palette was open', async () => {
    const opened = await uncachedNotification(work, () => SENT);
    act(() => {
      setUi({ overlay: { kind: 'palette' } });
    });
    opened.click();
    expect(useUiStore.getState().overlay).toBeNull();
    await opened.load();

    release(3);
    expectAt(personal, opened.folder, null);
    release(3);
    expectAt(work, SENT, null);
  });

  it('relocates the thread when its notification is clicked again over the settings', async () => {
    const opened = await uncachedNotification(work, () => SENT);
    opened.click();
    openSettings();
    opened.click();
    expect(useUiStore.getState().overlay).toBeNull();

    await opened.load();

    expectAt(personal, opened.folder, opened.threadId);
  });

  it('keeps the list of a notification still loading when another one loads first', async () => {
    const base = demoClient();
    const gates = new Map<string, Gate>();
    const client: MailClient = {
      ...base,
      getThread: (threadId) => {
        const held = gates.get(threadId) ?? gate();
        gates.set(threadId, held);
        return held.wait().then(() => base.getThread(threadId));
      },
    };
    const [first, second] = await splitThreads(base);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    const { queryClient, click } = await start(client);
    await settle();
    removeThreadFromLists(queryClient, first.id);
    removeThreadFromLists(queryClient, second.id);
    click(first.id);
    click(second.id);
    const open = async (thread: ThreadSummary) => {
      act(() => {
        gates.get(thread.id)?.open();
      });
      await settle();
    };

    await open(second);
    await open(first);

    release(3);
    expectAt('all', folderOf(second), null);
    release(3);
    expectAt('all', folderOf(first), first.id);
    release(3);
    expectAt('all', folderOf(first), null);
    release(3);
    expectAt('all', INBOX, null);
  });

  it('places the thread loaded under a message being written before it is closed', async () => {
    const opened = await uncachedNotification(work, () => SENT);
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });
    opened.click();

    await opened.load();
    expectAt(personal, opened.folder, opened.threadId);
    expect(useUiStore.getState().overlay?.kind).toBe('compose');
    act(() => {
      setUi({ overlay: null });
    });

    release(3);
    expectAt(personal, opened.folder, null);
    release(3);
    expectAt(work, SENT, null);
  });
});
