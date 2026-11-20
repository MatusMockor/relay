// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const DASHES = /[–—]/;

const countingClient = (kind: MailClient['kind'] = 'demo') => {
  const control = { calls: 0 };
  const base = demoClient();
  const client: MailClient = {
    ...base,
    kind,
    offlineStats: () => {
      control.calls += 1;
      return Promise.resolve({ local: 8_210, remote: 40_000 });
    },
  };
  return { client, control };
};

const openSync = async () => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'sync', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const rowText = (sheet: HTMLElement): string =>
  (
    within(sheet).getByText('Uchovávať offline', { selector: 'b' }).closest('.srow')?.textContent ??
    ''
  ).replace(NBSP, ' ');

describe('offline window setting', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('offers the five windows with six months selected and shows the stored count', async () => {
    const { client } = countingClient();
    renderApp({ demo: () => client });
    const sheet = await openSync();
    const group = await within(sheet).findByRole('radiogroup', { name: 'Uchovávať offline' });

    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['3 mesiace', '6 mesiacov', '1 rok', '5 rokov', 'Všetko']);
    await waitFor(() => {
      expect(
        within(group).getByRole('radio', { name: '6 mesiacov' }).getAttribute('aria-checked'),
      ).toBe('true');
    });
    await waitFor(() => {
      expect(rowText(sheet)).toContain('Offline uložené: 8 210 správ');
    });
    expect(rowText(sheet)).toContain(
      'Staršie maily ostanú v zozname a otvoria sa zo servera. Prílohy sa sťahujú vždy na požiadanie.',
    );
    expect(DASHES.test(rowText(sheet))).toBe(false);
  });

  it('saves a new window as a device setting', async () => {
    const { client } = countingClient();
    const { platform } = renderApp({ demo: () => client });
    const sheet = await openSync();
    const group = await within(sheet).findByRole('radiogroup', { name: 'Uchovávať offline' });

    fireEvent.click(within(group).getByRole('radio', { name: '1 rok' }));

    await waitFor(() => {
      expect(within(group).getByRole('radio', { name: '1 rok' }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
    await waitFor(async () => {
      expect((await platform.deviceSettings()).offlineWindow).toBe('1y');
    });
  });

  it('hides the row in remote mode', async () => {
    const remote = countingClient('remote');
    renderApp({ demo: () => remote.client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(within(sheet).getByText('Skontrolovať teraz', { selector: 'b' })).toBeTruthy();
    });

    expect(within(sheet).queryByText('Uchovávať offline')).toBeNull();
    expect(remote.control.calls).toBe(0);
  });
});
