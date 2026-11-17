// @vitest-environment jsdom
import {
  DEFAULT_USER_SETTINGS,
  type DeviceSettings,
  type SplitInput,
  type UserSettings,
} from '@relay/shared';
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

  const serveSettings = (ai: Partial<UserSettings['ai']>) => {
    server.handle('settings.get', () => ({
      body: { ...DEFAULT_USER_SETTINGS, ai: { ...DEFAULT_USER_SETTINGS.ai, ...ai } },
    }));
  };

  const aiLocationsOnceLoaded = async (sheet: HTMLElement) => {
    const runner = await within(sheet).findByRole('radiogroup', { name: 'Predvolený runner' });
    await waitFor(() => {
      expect(
        within(runner).getByRole('radio', { name: 'Codex' }).getAttribute('aria-checked'),
      ).toBe('true');
    });
    return within(within(sheet).getByRole('radiogroup', { name: 'Kde beží AI' }))
      .getAllByRole('radio')
      .map((radio) => radio.textContent);
  };

  it('offers only server AI in a browser session', async () => {
    serveSettings({ location: 'server', defaultRunner: 'codex' });
    renderApp({ platform: await syncedPlatform() });
    await waitForSync();
    expect(await aiLocationsOnceLoaded(openSection('ai'))).toEqual(['Server']);
  });

  it('still shows a local AI location saved on another device in a browser session', async () => {
    serveSettings({ location: 'local', defaultRunner: 'codex' });
    renderApp({ platform: await syncedPlatform() });
    await waitForSync();
    expect(await aiLocationsOnceLoaded(openSection('ai'))).toEqual(['Server', 'Lokálne']);
  });

  it('sends settings changes one at a time', async () => {
    const firstSave = gate();
    const updates = () => server.requests.filter((request) => request.key === 'settings.update');
    server.handle('settings.update', () => ({
      body: DEFAULT_USER_SETTINGS,
      holdUntil: updates().length === 1 ? firstSave.wait() : undefined,
    }));
    renderApp({ platform: await syncedPlatform() });
    await waitForSync();
    const sheet = openSection('ai');
    const summaries = await within(sheet).findByRole('switch', { name: 'Zhrnutia vlákien' });
    act(() => {
      fireEvent.click(within(sheet).getByRole('switch', { name: 'Jednoriadkové zhrnutia' }));
      fireEvent.click(summaries);
    });
    await waitFor(() => {
      expect(updates().length).toBeGreaterThan(0);
    });
    await settle(60);
    expect(updates()).toHaveLength(1);
    firstSave.open();
    await waitFor(() => {
      expect(updates()).toHaveLength(2);
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
    const removes = await within(sheet).findAllByRole('button', { name: /^Odstrániť split/ });
    expect(removes.length).toBeGreaterThan(1);
    act(() => {
      fireEvent.click(removes[0] ?? document.body);
    });
    act(() => {
      fireEvent.click(
        within(sheet).getAllByRole('button', { name: /^Odstrániť split/ })[1] ?? document.body,
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
    const stale: number[] = [];
    const platform: Platform = {
      ...base,
      deviceSettings: async () => {
        reads += 1;
        const settings = await base.deviceSettings();
        if (reads === 1) {
          return settings;
        }
        stale.push(settings.panelWidths.sidebar);
        await held.wait();
        return settings;
      },
    };
    renderApp({ platform, demo: demoClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await waitFor(() => {
      expect(stale).toEqual([232]);
    });
    act(() => {
      setUi((state) => ({ widths: { ...state.widths, sidebar: 320 } }));
    });
    held.open();
    await settle();
    expect(useUiStore.getState().widths.sidebar).toBe(320);
  });
});
