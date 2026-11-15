// @vitest-environment jsdom
import type { DeviceSettings, SplitInput } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { type SettingsSection, setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, gate, settle } from './features-support';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';

const openSection = (section: SettingsSection) => {
  act(() => {
    setUi({ overlay: { kind: 'settings', section, adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

describe('settings in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const syncedPlatform = async (
    override: (base: Platform) => Partial<Platform> = () => ({}),
  ): Promise<Platform> => {
    const base = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url }),
    );
    await base.tokenStore(server.url).save(tokens('token-a'));
    return { ...base, ...override(base) };
  };

  const waitForSync = async () => {
    await waitFor(() => {
      expect(server.requests.some((request) => request.key === 'threads.list')).toBe(true);
    });
  };

  it('reports a failed sign-out', async () => {
    const platform = await syncedPlatform((base) => ({
      updateDeviceSettings: (patch: Partial<DeviceSettings>) =>
        patch.mode === null
          ? Promise.reject(new Error('nastavenia sa nedajú zapísať'))
          : base.updateDeviceSettings(patch),
    }));
    renderApp({ platform });
    await waitForSync();
    const sheet = openSection('account');
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Odhlásiť' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Odhlásenie zlyhalo');
    });
  });

  it('offers only server AI in a browser session', async () => {
    renderApp({ platform: await syncedPlatform() });
    await waitForSync();
    const sheet = openSection('ai');
    const location = await within(sheet).findByRole('radiogroup', { name: 'Kde beží AI' });
    expect(
      within(location)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Server']);
  });

  it('sends settings changes one at a time', async () => {
    server.handle('settings.update', () => ({
      body: {
        ai: {
          location: 'server',
          defaultRunner: 'claude',
          features: { oneLiners: true, summaries: true, replySuggestions: true, jiraTriage: true },
        },
      },
      delayMs: 150,
    }));
    renderApp({ platform: await syncedPlatform() });
    await waitForSync();
    const sheet = openSection('ai');
    const summaries = await within(sheet).findByRole('switch', { name: 'Zhrnutia vlákien' });
    act(() => {
      fireEvent.click(within(sheet).getByRole('switch', { name: 'Jednoriadkové zhrnutia' }));
      fireEvent.click(summaries);
    });
    await settle(60);
    expect(server.requests.filter((request) => request.key === 'settings.update')).toHaveLength(1);
    await waitFor(() => {
      expect(server.requests.filter((request) => request.key === 'settings.update')).toHaveLength(
        2,
      );
    });
  });
});

describe('split settings', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('does not send a split edit while the previous save is pending', async () => {
    const base = demoClient();
    const held = gate();
    const saves: SplitInput[][] = [];
    const client: MailClient = {
      ...base,
      replaceSplits: async (splits) => {
        saves.push(splits);
        await held.wait();
        return base.replaceSplits(splits);
      },
    };
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const sheet = openSection('splits');
    const removes = await within(sheet).findAllByRole('button', { name: 'Odstrániť' });
    expect(removes.length).toBeGreaterThan(1);
    act(() => {
      fireEvent.click(removes[0] ?? document.body);
    });
    act(() => {
      fireEvent.click(
        within(sheet).getAllByRole('button', { name: 'Odstrániť' })[1] ?? document.body,
      );
    });
    expect(saves).toHaveLength(1);
    held.open();
    await settle();
  });

  it('does not add a split before the existing splits load', async () => {
    const base = demoClient();
    const held = gate();
    const saves: SplitInput[][] = [];
    const client: MailClient = {
      ...base,
      listSplits: async () => {
        await held.wait();
        return base.listSplits();
      },
      replaceSplits: (splits) => {
        saves.push(splits);
        return base.replaceSplits(splits);
      },
    };
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const sheet = openSection('splits');
    fireEvent.change(within(sheet).getByLabelText('Nový split'), { target: { value: 'Klienti' } });
    fireEvent.change(within(sheet).getByLabelText('Doména'), { target: { value: 'klient.sk' } });
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Pridať split' }));
    });
    expect(saves).toEqual([]);
    held.open();
    await settle();
  });
});

describe('panel widths', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps a resize made while the saved widths are still loading', async () => {
    const base = createBrowserPlatform(storageWith({ mode: 'local' }));
    const held = gate();
    let reads = 0;
    const platform: Platform = {
      ...base,
      deviceSettings: async () => {
        reads += 1;
        if (reads > 1) {
          await held.wait();
        }
        return base.deviceSettings();
      },
    };
    renderApp({ platform, demo: demoClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi((state) => ({ widths: { ...state.widths, sidebar: 320 } }));
    });
    held.open();
    await settle();
    expect(useUiStore.getState().widths.sidebar).toBe(320);
  });
});
