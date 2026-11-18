import { streamHub } from '../events/hub-stream';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { IpcStreamHandlers } from '../ipc/stream-router';
import type { UpdateService } from '../updates/update-service';

const MAX_BUFFERED_STATUSES = 50;

export const createUpdateInvokeHandlers = (updates: UpdateService): IpcInvokeHandlers => ({
  'app.update.status': () => updates.status(),
  'app.update.check': () => {
    void updates.check();
    return { ok: true as const };
  },
  'app.update.install': () => {
    updates.install();
    return { ok: true as const };
  },
});

export const createUpdateStreamHandlers = (updates: UpdateService): IpcStreamHandlers => ({
  'app.update.events': (_input, signal) =>
    streamHub(updates.changes, signal, MAX_BUFFERED_STATUSES, () => [updates.status()]),
});
