import type { ContextMenuRequest } from '@relay/shared/ipc';
import type { BrowserWindow } from 'electron';
import { type ContextMenuFactory, showContextMenu } from './context-menu';

export interface ContextMenuPresenter {
  show(request: ContextMenuRequest): Promise<string | null>;
}

export class WindowContextMenuPresenter<Window = BrowserWindow> implements ContextMenuPresenter {
  constructor(
    private readonly window: () => Window | null,
    private readonly factory: ContextMenuFactory<Window>,
  ) {}

  async show(request: ContextMenuRequest): Promise<string | null> {
    const window = this.window();
    if (window === null) {
      return null;
    }
    return showContextMenu(window, request, this.factory);
  }
}
