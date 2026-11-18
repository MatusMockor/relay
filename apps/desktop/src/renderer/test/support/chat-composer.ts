import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { MailClient } from '../../src/data/MailClient';

export const recordingClient = (requests: AiRunRequest[]): MailClient => {
  const base = createDemoMailClient({ aiStepMs: 0 });
  return {
    ...base,
    runAi: (request, listener) => {
      requests.push(request);
      return base.runAi(request, listener);
    },
  };
};

export const openAiPane = () => {
  act(() => {
    fireEvent.click(screen.getByRole('tab', { name: /^AI/ }));
  });
  return screen.getByRole('tabpanel', { name: 'AI' });
};

export const modelTrigger = (pane: HTMLElement) =>
  within(pane).getByRole('button', { name: /^Model: / });

export const reasoningTrigger = (pane: HTMLElement) =>
  within(pane).getByRole('button', { name: /^Reasoning: / });

export const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

export const press = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  });
};

export const questionInput = (pane: HTMLElement) =>
  within(pane).getByRole('textbox', { name: 'Otázka pre AI' });

export const openModelMenu = (pane: HTMLElement) => {
  click(modelTrigger(pane));
  return screen.getByRole('dialog', { name: 'Výber modelu' });
};

export const listedModels = (menu: HTMLElement): string[] =>
  within(within(menu).getByRole('listbox', { name: 'Model' }))
    .getAllByRole('option')
    .map((row) => row.querySelector('.nm')?.textContent ?? '');

export const ask = async (pane: HTMLElement, question: string, requests: AiRunRequest[]) => {
  const count = requests.length;
  const input = within(pane).getByRole('textbox', { name: 'Otázka pre AI' });
  fireEvent.change(input, { target: { value: question } });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  await waitFor(() => {
    expect(requests).toHaveLength(count + 1);
  });
  return requests[count];
};
