import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { RendererView } from '../native/renderer-view';

export const createTrayInvokeHandlers = (view: RendererView): IpcInvokeHandlers => ({
  'app.tray.report': (input) => {
    view.update(input);
    return { ok: true as const };
  },
});
