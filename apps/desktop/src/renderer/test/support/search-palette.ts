import type { ServerSearchRequest, ServerSearchResponse, ThreadState } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { DemoServerSearchOptions } from '../../src/data/demo/demo-server-search';
import type { DemoState } from '../../src/data/demo/demo-state';
import { buildDemoState } from '../../src/data/demo/seed/build-state';
import { demoIds } from '../../src/data/demo/seed/ids';
import type { MailClient } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';
import { renderApp } from './render-app';

export const LOCAL_DPH = 'Podklady k DPH za október';
export const SERVER_DELAY_MS = 900;
export const DEBOUNCE_MS = 300;
export const DASHES = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];

export const setOnline = (online: boolean): void => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
};

export interface SearchHarness {
  readonly state: DemoState;
  readonly client: MailClient;
  readonly requests: ServerSearchRequest[];
}

export interface SearchHarnessOptions {
  readonly serverSearch?: DemoServerSearchOptions;
  readonly answer?: (request: ServerSearchRequest) => Promise<ServerSearchResponse>;
  readonly seed?: (state: DemoState) => void;
}

export const addThread = (
  state: DemoState,
  key: string,
  patch: { readonly subject: string; readonly state?: ThreadState; readonly unread?: boolean },
): void => {
  const original = state.threads.get(demoIds.thread('fl-dph'));
  expect(original).toBeDefined();
  if (original === undefined) {
    return;
  }
  const id = demoIds.thread(key);
  state.threads.set(id, {
    ...original,
    messages: original.messages.map((message) => ({ ...message, threadId: id })),
    summary: {
      ...original.summary,
      id,
      subject: patch.subject,
      state: patch.state ?? 'inbox',
      unread: patch.unread ?? original.summary.unread,
    },
  });
};

export const startSearch = async (options: SearchHarnessOptions = {}): Promise<SearchHarness> => {
  const state = buildDemoState(new Date());
  options.seed?.(state);
  const demo = createDemoMailClient({ aiStepMs: 0, state, serverSearch: options.serverSearch });
  const requests: ServerSearchRequest[] = [];
  const client: MailClient = {
    ...demo,
    searchServer: (request) => {
      requests.push(request);
      return options.answer === undefined ? demo.searchServer(request) : options.answer(request);
    },
  };
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return { state, client, requests };
};

export const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

export const openPalette = (): void => {
  act(() => {
    setUi({ overlay: { kind: 'search' } });
  });
};

export const palette = (): HTMLElement => screen.getByRole('dialog', { name: 'Hľadať v pošte' });

export const searchBox = (): HTMLInputElement =>
  within(palette()).getByRole<HTMLInputElement>('textbox', { name: 'Hľadať v pošte' });

export const typeQuery = (value: string): void => {
  act(() => {
    fireEvent.change(searchBox(), { target: { value } });
  });
};

export const pressInPalette = (key: string, init: KeyboardEventInit = {}): void => {
  act(() => {
    fireEvent.keyDown(searchBox(), { key, ...init });
  });
};

export const section = (name: string): HTMLElement =>
  within(palette()).getByRole('region', { name });

export const optionsIn = (name: string): HTMLElement[] =>
  within(section(name)).queryAllByRole('option');

export const selectedText = (): string =>
  within(palette())
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')?.textContent ?? '';

export const serverSection = (): HTMLElement | null =>
  within(palette()).queryByRole('region', { name: 'Staršia pošta na serveri' });

export const chip = (name: string): HTMLElement => within(palette()).getByRole('button', { name });
