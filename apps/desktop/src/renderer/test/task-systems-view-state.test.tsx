// @vitest-environment jsdom
import type { RealtimeEvent, ThreadId } from '@relay/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoConnectionId } from '../src/data/demo/demo-task-system-data';
import { MailClientError } from '../src/data/errors';
import type { MailClient, MailEventListener } from '../src/data/MailClient';
import { folderKey } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import { press } from './features-support';
import { resetStores } from './support/render-app';
import {
  ACME_JIRA,
  openConnection,
  renderWithLinks,
  resetWithSidebar,
  selectedTaskKey,
  taskSystemClient,
} from './support/task-systems';

interface Switchable {
  readonly client: MailClient;
  reject(): void;
  emit(event: RealtimeEvent): void;
}

const switchable = (inner: MailClient): Switchable => {
  const listeners = new Set<MailEventListener>();
  const state = { rejected: false };
  return {
    client: {
      ...inner,
      listTaskSystemTasks: (connectionId) =>
        state.rejected
          ? Promise.reject(
              new MailClientError({ code: 'forbidden', message: 'Token je neplatný.' }),
            )
          : inner.listTaskSystemTasks(connectionId),
      subscribe: (listener) => {
        listeners.add(listener);
        const stop = inner.subscribe(listener);
        return () => {
          listeners.delete(listener);
          stop();
        };
      },
    },
    reject: () => {
      state.rejected = true;
    },
    emit: (event) => {
      listeners.forEach((listener) => {
        listener(event);
      });
    },
  };
};

const storedSelection = (): string | undefined => {
  const state = useUiStore.getState();
  return state.selected[folderKey(state.folder)];
};

describe('task system list view state', () => {
  beforeEach(resetWithSidebar);
  afterEach(resetStores);

  it('never opens cached tickets while the reconnect screen is shown', async () => {
    const harness = switchable(taskSystemClient());
    const opened = renderWithLinks(harness.client);
    await openConnection();
    await waitFor(() => {
      expect(selectedTaskKey()).toBe('ACME-142');
    });

    harness.reject();
    act(() => {
      harness.emit({
        type: 'taskSystems.updated',
        at: new Date().toISOString(),
        data: { connectionId: demoConnectionId(1) },
      });
    });

    expect(await screen.findByRole('button', { name: 'Znova pripojiť' })).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: new RegExp(ACME_JIRA) }).querySelector('b'),
    ).toBeNull();
    press('j', {}, document.body);
    press('Enter', {}, document.body);
    expect(opened).toEqual([]);
  });

  it('leaves the keys to the mail view while a thread is open', async () => {
    const opened = renderWithLinks(taskSystemClient());
    await openConnection();
    await waitFor(() => {
      expect(selectedTaskKey()).toBe('ACME-142');
    });
    const before = storedSelection();

    act(() => {
      setUi({ openThreadId: 'thr_elsewhere' as ThreadId });
    });
    press('j', {}, document.body);
    press('Enter', {}, document.body);

    expect(storedSelection()).toBe(before);
    expect(opened).toEqual([]);
  });
});
