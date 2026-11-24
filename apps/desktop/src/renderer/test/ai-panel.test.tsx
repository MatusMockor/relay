// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { renderApp, resetStores } from './support/render-app';

const REVIEW = 'Code review: refaktor platobnej brány';

const openThreadBySubject = async (subject: string) => {
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  const row = within(list)
    .getAllByRole('option')
    .find((item) => item.textContent.includes(subject));
  expect(row).toBeDefined();
  act(() => {
    fireEvent.click(row ?? document.body);
  });
  return screen.findByRole('heading', { level: 1, name: subject });
};

const openAiTab = () => {
  act(() => {
    fireEvent.click(screen.getByRole('tab', { name: /^AI/ }));
  });
  return screen.getByRole('tabpanel', { name: 'AI' });
};

describe('AI panel', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('turns chat answer references into links that open the thread', async () => {
    renderApp();
    await openThreadBySubject(REVIEW);
    const pane = openAiTab();
    const input = within(pane).getByRole('textbox', { name: 'Otázka pre AI' });
    fireEvent.change(input, { target: { value: 'Zhrň toto vlákno' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    const related = await within(pane).findByRole('group', { name: 'Súvisiace vlákna' });
    const link = within(related).getByRole('button', { name: REVIEW });
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 1, name: REVIEW })).toBeNull();
    });
    act(() => {
      fireEvent.click(link);
    });
    expect(await screen.findByRole('heading', { level: 1, name: REVIEW })).toBeDefined();
  });

  it('creates a task from the open thread through the AI panel', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    renderApp({ demo: () => client });
    await openThreadBySubject(REVIEW);
    const pane = openAiTab();
    fireEvent.change(within(pane).getByRole('textbox', { name: 'Otázka pre AI' }), {
      target: { value: 'Skontrolovať platobnú bránu' },
    });
    act(() => {
      fireEvent.click(within(pane).getByRole('button', { name: 'Vytvoriť úlohu' }));
    });
    expect(
      await within(pane).findByText(/Úloha vytvorená: Skontrolovať platobnú bránu/),
    ).toBeDefined();
    const tasks = await client.listTasks({ state: 'open' });
    expect(tasks.items).toContainEqual(
      expect.objectContaining({ title: 'Skontrolovať platobnú bránu', source: 'ai' }),
    );
  });

  it('does not claim a draft exists after a draft call the run never confirmed', async () => {
    const base = createDemoMailClient({ aiStepMs: 0 });
    const client: MailClient = {
      ...base,
      runAi: (_request, listener) => {
        listener({ type: 'started', runner: 'claude' });
        listener({ type: 'toolCall', name: 'create_draft' });
        listener({
          type: 'completed',
          output: { kind: 'chatAnswer', text: 'Koncept sa nepodarilo uložiť.', references: [] },
        });
        return () => {};
      },
    };
    renderApp({ demo: () => client });
    await openThreadBySubject(REVIEW);
    const pane = openAiTab();
    const input = within(pane).getByRole('textbox', { name: 'Otázka pre AI' });
    fireEvent.change(input, { target: { value: 'Priprav odpoveď' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(await within(pane).findByText('Koncept sa nepodarilo uložiť.')).toBeDefined();
    expect(within(pane).getByText('Príprava konceptu')).toBeDefined();
    expect(within(pane).queryByText('Koncept pripravený')).toBeNull();
  });
});
