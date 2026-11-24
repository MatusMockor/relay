import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { DemoTaskSystemsOptions } from '../../src/data/demo/demo-task-systems';
import type { MailClient } from '../../src/data/MailClient';
import { openContextMenu } from '../../src/features/context-menu/context-menu-store';
import { createBrowserPlatform } from '../../src/platform/BrowserPlatform';
import { setUi } from '../../src/state/ui-store';
import { renderApp, resetStores, storageWith } from './render-app';

export const ACME_JIRA = 'Acme Jira';
export const ACME_LINEAR = 'Acme Linear';

export const resetWithSidebar = (): void => {
  resetStores();
  setUi({ leftUser: true });
};

export const taskSystemClient = (options: DemoTaskSystemsOptions = {}): MailClient =>
  createDemoMailClient({ aiStepMs: 0, taskSystems: options });

export const renderWithLinks = (client: MailClient): string[] => {
  const opened: string[] = [];
  const platform = createBrowserPlatform(storageWith({ mode: 'local' }), openContextMenu);
  renderApp({
    demo: () => client,
    platform: {
      ...platform,
      openExternal: (url) => {
        opened.push(url);
      },
    },
  });
  return opened;
};

export const sidebar = (): HTMLElement => screen.getByRole('navigation', { name: 'Priečinky' });

export const sidebarItem = (label: string): HTMLElement | null =>
  within(sidebar())
    .queryAllByRole('button')
    .find((button) => button.querySelector('.fl')?.textContent === label) ?? null;

export const openConnection = async (label = ACME_JIRA): Promise<HTMLElement> => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  const item = await within(sidebar()).findByRole('button', { name: new RegExp(label) });
  act(() => {
    fireEvent.click(item);
  });
  return screen.findByRole('listbox', { name: 'Úlohy' });
};

export const taskRows = (): HTMLElement[] =>
  within(screen.getByRole('listbox', { name: 'Úlohy' })).getAllByRole('option');

export const taskKeys = (): string[] =>
  taskRows().map((row) => row.querySelector('.ts-key')?.textContent ?? '');

export const selectedTaskKey = (): string =>
  taskRows()
    .find((row) => row.getAttribute('aria-selected') === 'true')
    ?.querySelector('.ts-key')?.textContent ?? '';

export const taskGroupLabels = (): string[] =>
  within(screen.getByRole('listbox', { name: 'Úlohy' }))
    .getAllByRole('group')
    .map((group) => group.getAttribute('aria-label') ?? '');

export const settingsSheet = (): HTMLElement => screen.getByRole('dialog', { name: 'Nastavenia' });

export const expectField = (form: HTMLElement, label: string, value: string): void => {
  expect(within(form).getByLabelText<HTMLInputElement>(label).value).toBe(value);
};
