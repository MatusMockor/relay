// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoHits } from '../src/features/list/EmptyState';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const keysIn = (element: Element): (string | null)[] =>
  [...element.querySelectorAll('.kbd')].map((key) => key.textContent);

describe('shortcut hints next to user text', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('keeps brackets in the search query as plain text', () => {
    const { container } = render(<NoHits query="[urgent" />);
    const paragraph = container.querySelector('p');

    expect(paragraph?.textContent).toContain('Pre „[urgent“ tu nie je žiadna konverzácia.');
    expect(paragraph === null ? [] : keysIn(paragraph)).toEqual(['Esc']);
  });

  it('keeps brackets in the account name out of the folder shortcuts', async () => {
    const client = demoClient();
    const [account] = await client.listAccounts();
    expect(account).toBeDefined();
    if (account === undefined) {
      return;
    }
    await client.updateAccount(account.id, { displayName: 'Work [Ops]' });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    act(() => {
      setUi({ scope: account.id, folder: { kind: 'view', view: 'sent' } });
    });

    const sub = await screen.findByText(/účet Work \[Ops\]/);
    expect(keysIn(sub)).not.toContain('Ops');
  });
});
