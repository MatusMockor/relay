import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { AiRunRequest } from '@relay/shared';
import type { MailClient } from '../src/data/MailClient';

export interface Gate {
  readonly wait: () => Promise<void>;
  readonly open: () => void;
}

export const gate = (): Gate => {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait: () => opened, open: release };
};

export const demoClient = (): MailClient => createDemoMailClient({ aiStepMs: 0 });

export const pause = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const settle = async (ms = 20): Promise<void> => {
  await act(async () => {
    await pause(ms);
  });
};

export const press = (
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
): boolean => {
  let result = true;
  act(() => {
    result = fireEvent.keyDown(target, { key, ...init });
  });
  return result;
};

export const openThreadBySubject = async (subject: string): Promise<void> => {
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  const row = within(list)
    .getAllByRole('option')
    .find((item) => item.textContent.includes(subject));
  expect(row).toBeDefined();
  act(() => {
    fireEvent.click(row ?? document.body);
  });
  await screen.findByRole('heading', { level: 1, name: subject });
};

export const heldAi = (base: MailClient, held: Gate, requests: AiRunRequest[]): MailClient => ({
  ...base,
  runAi: (request, listener) => {
    requests.push(request);
    let stopped = false;
    let stop: () => void = () => undefined;
    void held.wait().then(() => {
      if (!stopped) {
        stop = base.runAi(request, listener);
      }
    });
    return () => {
      stopped = true;
      stop();
    };
  },
});
