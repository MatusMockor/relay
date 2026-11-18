import type { ContextMenuRequest } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import {
  type ContextMenuFactory,
  type ContextMenuHandle,
  type ContextMenuPopupOptions,
  type ContextMenuTemplateItem,
  showContextMenu,
} from '../../src/main/native/context-menu';
import { WindowContextMenuPresenter } from '../../src/main/native/context-menu-presenter';
import { contextMenuWindow } from '../../src/main/native/context-menu-window';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';

interface FakeWindow {
  readonly name: string;
}

class RecordingMenu implements ContextMenuHandle<FakeWindow> {
  popups: ContextMenuPopupOptions<FakeWindow>[] = [];

  constructor(readonly template: readonly ContextMenuTemplateItem[]) {}

  popup(options: ContextMenuPopupOptions<FakeWindow>): void {
    this.popups.push(options);
  }

  click(id: string): void {
    const item = this.template.find((entry) => entry.type === 'normal' && entry.id === id);
    expect(item?.type).toBe('normal');
    if (item?.type === 'normal') {
      item.click();
    }
  }

  close(): void {
    this.popups.forEach((popup) => {
      popup.callback();
    });
  }
}

class RecordingMenuFactory implements ContextMenuFactory<FakeWindow> {
  menus: RecordingMenu[] = [];

  build(template: readonly ContextMenuTemplateItem[]): RecordingMenu {
    const menu = new RecordingMenu(template);
    this.menus.push(menu);
    return menu;
  }

  last(): RecordingMenu {
    const menu = this.menus.at(-1);
    expect(menu).toBeDefined();
    return menu ?? new RecordingMenu([]);
  }
}

const WINDOW: FakeWindow = { name: 'main' };

const REQUEST: ContextMenuRequest = {
  items: [
    { type: 'item', id: 'read', label: 'Označiť ako prečítané', enabled: true },
    { type: 'separator' },
    { type: 'item', id: 'trash', label: 'Presunúť do koša', enabled: false },
  ],
  x: 120,
  y: 48,
};

const appMetadata = {
  name: 'Relay',
  version: '0.1.10',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

const bridgeWith = (
  windows: { readonly focused: FakeWindow | null; readonly all: readonly FakeWindow[] },
  factory: RecordingMenuFactory,
) =>
  createRelayBridge(
    new InMemoryIpc(
      composeIpc({
        app: appMetadata,
        contextMenu: new WindowContextMenuPresenter(
          contextMenuWindow({ focused: () => windows.focused, all: () => windows.all }),
          factory,
        ),
      }),
    ),
    () => 'context-menu-stream',
  );

const BACKGROUND: FakeWindow = { name: 'background' };

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('native context menu', () => {
  it('builds the template from the requested items and pops up at the point', async () => {
    const factory = new RecordingMenuFactory();
    const choice = showContextMenu(WINDOW, REQUEST, factory);
    const menu = factory.last();

    expect(
      menu.template.map((item) =>
        item.type === 'separator' ? 'separator' : `${item.label}:${String(item.enabled)}`,
      ),
    ).toEqual(['Označiť ako prečítané:true', 'separator', 'Presunúť do koša:false']);
    expect(menu.popups.map(({ window, x, y }) => ({ window, x, y }))).toEqual([
      { window: WINDOW, x: 120, y: 48 },
    ]);
    menu.close();
    expect(await choice).toBeNull();
  });

  it('resolves the id of the clicked item', async () => {
    const factory = new RecordingMenuFactory();
    const choice = showContextMenu(WINDOW, REQUEST, factory);

    factory.last().click('read');

    expect(await choice).toBe('read');
  });

  it('resolves null when the menu closes without a selection', async () => {
    const factory = new RecordingMenuFactory();
    const choice = showContextMenu(WINDOW, REQUEST, factory);

    factory.last().close();

    expect(await choice).toBeNull();
  });

  it('keeps the clicked id when the menu closes after the click', async () => {
    const factory = new RecordingMenuFactory();
    const choice = showContextMenu(WINDOW, REQUEST, factory);

    factory.last().click('read');
    factory.last().close();

    expect(await choice).toBe('read');
  });

  it('keeps the clicked id when the close callback fires just before the click', async () => {
    const factory = new RecordingMenuFactory();
    const choice = showContextMenu(WINDOW, REQUEST, factory);

    factory.last().close();
    factory.last().click('read');

    expect(await choice).toBe('read');
  });
});

describe('context menu IPC', () => {
  it('returns the chosen item id to the renderer', async () => {
    const factory = new RecordingMenuFactory();
    const bridge = bridgeWith({ focused: WINDOW, all: [BACKGROUND, WINDOW] }, factory);

    const result = bridge.invoke('app.contextMenu.show', REQUEST);
    await settle();
    factory.last().click('read');

    expect(await result).toEqual({ ok: true, data: { id: 'read' } });
    expect(factory.last().popups.map(({ window }) => window)).toEqual([WINDOW]);
  });

  it('shows the menu in the app window when the app is not focused', async () => {
    const factory = new RecordingMenuFactory();
    const bridge = bridgeWith({ focused: null, all: [BACKGROUND] }, factory);

    const result = bridge.invoke('app.contextMenu.show', REQUEST);
    await settle();
    expect(factory.last().popups.map(({ window }) => window)).toEqual([BACKGROUND]);
    factory.last().click('read');

    expect(await result).toEqual({ ok: true, data: { id: 'read' } });
  });

  it('answers null without a menu when there is no window to show it in', async () => {
    const factory = new RecordingMenuFactory();
    const bridge = bridgeWith({ focused: null, all: [] }, factory);

    expect(await bridge.invoke('app.contextMenu.show', REQUEST)).toEqual({
      ok: true,
      data: { id: null },
    });
    expect(factory.menus).toEqual([]);
  });

  it('rejects a request without items', async () => {
    const factory = new RecordingMenuFactory();
    const bridge = bridgeWith({ focused: WINDOW, all: [WINDOW] }, factory);

    const result = await bridge.invoke('app.contextMenu.show', { items: [], x: 1, y: 1 });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe('validation_failed');
    expect(factory.menus).toEqual([]);
  });
});
