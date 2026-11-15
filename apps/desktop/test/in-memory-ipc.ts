import {
  IPC_INVOKE,
  IPC_STREAM_CANCEL,
  IPC_STREAM_MESSAGE,
  IPC_STREAM_START,
} from '@relay/shared/ipc';
import type { IpcRouters } from '../src/main/ipc/register-ipc';
import type { IpcRendererListener, IpcRendererPort } from '../src/preload/create-bridge';

export class InMemoryIpc implements IpcRendererPort {
  private readonly listeners = new Map<string, IpcRendererListener[]>();

  constructor(private readonly routers: IpcRouters) {}

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const [payload] = args;
    if (channel === IPC_INVOKE) {
      return this.routers.invoke.dispatch(payload);
    }
    if (channel === IPC_STREAM_START) {
      return Promise.resolve(
        this.routers.streams.start(payload, (message) => {
          this.emit(IPC_STREAM_MESSAGE, message);
        }),
      );
    }
    if (channel === IPC_STREAM_CANCEL) {
      this.routers.streams.cancel(payload);
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ ok: false, error: { code: 'not_found', message: channel } });
  }

  on(channel: string, listener: IpcRendererListener): void {
    this.listeners.set(channel, [...(this.listeners.get(channel) ?? []), listener]);
  }

  private emit(channel: string, payload: unknown): void {
    (this.listeners.get(channel) ?? []).forEach((listener) => {
      listener({}, payload);
    });
  }
}
