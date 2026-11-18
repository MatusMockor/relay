import type { ContextMenuItem, ContextMenuRequest } from '@relay/shared/ipc';
import { type BrowserWindow, Menu } from 'electron';

export type ContextMenuTemplateItem =
  | {
      readonly type: 'normal';
      readonly id: string;
      readonly label: string;
      readonly enabled: boolean;
      readonly click: () => void;
    }
  | { readonly type: 'separator' };

export interface ContextMenuPopupOptions<Window> {
  readonly window: Window;
  readonly callback: () => void;
}

export interface ContextMenuHandle<Window> {
  popup(options: ContextMenuPopupOptions<Window>): void;
}

export interface ContextMenuFactory<Window = BrowserWindow> {
  build(template: readonly ContextMenuTemplateItem[]): ContextMenuHandle<Window>;
}

export const electronContextMenuFactory: ContextMenuFactory = {
  build: (template) => Menu.buildFromTemplate([...template]),
};

const templateItem = (
  item: ContextMenuItem,
  choose: (id: string) => void,
): ContextMenuTemplateItem => {
  if (item.type === 'separator') {
    return { type: 'separator' };
  }
  return {
    type: 'normal',
    id: item.id,
    label: item.label,
    enabled: item.enabled,
    click: () => {
      choose(item.id);
    },
  };
};

export const showContextMenu = <Window = BrowserWindow>(
  window: Window,
  request: ContextMenuRequest,
  factory: ContextMenuFactory<Window>,
): Promise<string | null> =>
  new Promise((resolve) => {
    const template = request.items.map((item) => templateItem(item, resolve));
    factory.build(template).popup({
      window,
      callback: () => {
        setImmediate(() => {
          resolve(null);
        });
      },
    });
  });
