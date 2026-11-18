// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

describe('thread navigation buttons', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('does nothing when the disabled previous button is activated on the first thread', async () => {
    renderApp({ demo: () => demoClient() });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    const [first] = within(list).getAllByRole('option');
    expect(first).toBeDefined();

    act(() => {
      if (first !== undefined) {
        fireEvent.click(first);
      }
    });

    const previous = await screen.findByRole('button', { name: 'Predchádzajúca' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      fireEvent.click(previous);
    });
    await settle();

    expect(screen.queryByText('Toto je prvá konverzácia')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ďalšia' }).getAttribute('aria-disabled')).toBeNull();
  });
});
