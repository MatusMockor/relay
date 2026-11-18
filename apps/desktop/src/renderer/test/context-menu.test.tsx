// @vitest-environment jsdom
import type { ContextMenuItem } from '@relay/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { AppContextProvider } from '../src/data/hooks/services-context';
import { openContextMenu } from '../src/features/context-menu/context-menu-store';
import { ContextMenuHost } from '../src/features/context-menu/ContextMenuHost';
import { useContextMenu } from '../src/features/context-menu/use-context-menu';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { useSessionStore } from '../src/session/session-store';
import { SessionController } from '../src/session/SessionController';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores, storageWith } from './support/render-app';

const ITEMS: ContextMenuItem[] = [
  { type: 'item', id: 'read', label: 'Označiť ako prečítané', enabled: true },
  { type: 'item', id: 'done', label: 'Hotovo', enabled: false },
  { type: 'separator' },
  { type: 'item', id: 'trash', label: 'Presunúť do koša', enabled: true },
];

const press = (key: string) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });
};

const open = (platform: Platform, items: ContextMenuItem[] = ITEMS) => {
  let choice: Promise<string | null> = Promise.resolve(null);
  act(() => {
    choice = platform.showContextMenu({ items, x: 140, y: 220 });
  });
  return choice;
};

const showShell = async () => {
  const { platform } = renderApp();
  await screen.findByRole('navigation', { name: 'Priečinky' });
  return platform;
};

const item = (name: string) =>
  within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(name) });

describe('context menu popover fallback', () => {
  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
  });
  afterEach(() => {
    resetStores();
  });

  it('shows the requested items at the click point and resolves the clicked id', async () => {
    const platform = await showShell();
    const choice = open(platform);

    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((entry) => entry.textContent),
    ).toEqual(['Označiť ako prečítané', 'Hotovo', 'Presunúť do koša']);
    expect(menu.querySelectorAll('.sepl')).toHaveLength(1);
    expect(menu.style.top).toBe('226px');
    act(() => {
      fireEvent.click(item('Presunúť do koša'));
    });

    expect(await choice).toBe('trash');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('resolves null when closed with Escape', async () => {
    const platform = await showShell();
    const choice = open(platform);

    press('Escape');

    expect(await choice).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not let a disabled item be chosen by click or keyboard', async () => {
    const platform = await showShell();
    const choice = open(platform);

    expect(item('Hotovo').getAttribute('aria-disabled')).toBe('true');
    act(() => {
      fireEvent.click(item('Hotovo'));
    });
    expect(screen.getByRole('menu')).toBeDefined();
    press('j');
    expect(item('Presunúť do koša').className).toContain('on');
    press('k');
    expect(item('Označiť ako prečítané').className).toContain('on');
    press('ArrowUp');
    press('Enter');

    expect(await choice).toBe('trash');
  });

  it('closes the previous menu with null when a new one opens', async () => {
    const platform = await showShell();
    const first = open(platform);
    const second = open(platform, [ITEMS[0] ?? { type: 'separator' }]);

    expect(await first).toBeNull();
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(1);
    press('Enter');
    expect(await second).toBe('read');
  });

  it('works while the folder sidebar is hidden', async () => {
    setUi({ leftUser: false });
    const { platform } = renderApp();
    await screen.findByRole('button', { name: /Zobraziť priečinky/ });
    const choice = open(platform);

    act(() => {
      fireEvent.click(item('Označiť ako prečítané'));
    });

    expect(await choice).toBe('read');
  });
});

function Target({ onChoice }: { readonly onChoice: (id: string | null) => void }) {
  const showMenu = useContextMenu();
  return (
    <div
      onContextMenu={(event) => {
        void showMenu(event, ITEMS).then(onChoice);
      }}
    >
      Cieľ
    </div>
  );
}

describe('useContextMenu', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('prevents the browser menu and opens the menu at the pointer', async () => {
    const platform = createBrowserPlatform(storageWith({ mode: 'local' }), openContextMenu);
    const session = new SessionController(platform, useSessionStore, {
      demo: () => createDemoMailClient({ aiStepMs: 0 }),
    });
    const choices: (string | null)[] = [];
    render(
      <AppContextProvider value={{ platform, session }}>
        <Target onChoice={(id) => choices.push(id)} />
        <ContextMenuHost />
      </AppContextProvider>,
    );

    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.contextMenu(screen.getByText('Cieľ'), {
        clientX: 60,
        clientY: 90,
      });
    });

    expect(notPrevented).toBe(false);
    expect(screen.getByRole('menu').style.top).toBe('96px');
    act(() => {
      fireEvent.click(item('Označiť ako prečítané'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(choices).toEqual(['read']);
  });
});
