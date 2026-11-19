import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { ContextMenuPresenter } from '../native/context-menu-presenter';

export const createContextMenuHandlers = (menus: ContextMenuPresenter): IpcInvokeHandlers => ({
  'app.contextMenu.show': async (request) => ({ id: await menus.show(request) }),
});
