import {
  IPC_INVOKE,
  IPC_STREAM_CANCEL,
  IPC_STREAM_MESSAGE,
  IPC_STREAM_START,
} from '@relay/shared/ipc';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { IpcInvokeRouter } from './invoke-router';
import type { IpcStreamRouter } from './stream-router';

export interface IpcRouters {
  readonly invoke: IpcInvokeRouter;
  readonly streams: IpcStreamRouter;
}

export const registerIpc = (ipcMain: IpcMain, routers: IpcRouters): (() => void) => {
  ipcMain.handle(IPC_INVOKE, (_event: IpcMainInvokeEvent, envelope: unknown) =>
    routers.invoke.dispatch(envelope),
  );
  ipcMain.handle(IPC_STREAM_START, (event: IpcMainInvokeEvent, envelope: unknown) => {
    const { sender } = event;
    return routers.streams.start(envelope, (message) => {
      if (sender.isDestroyed()) {
        return;
      }
      sender.send(IPC_STREAM_MESSAGE, message);
    });
  });
  ipcMain.handle(IPC_STREAM_CANCEL, (_event: IpcMainInvokeEvent, envelope: unknown) => {
    routers.streams.cancel(envelope);
  });
  return () => {
    routers.streams.cancelAll();
    [IPC_INVOKE, IPC_STREAM_START, IPC_STREAM_CANCEL].forEach((channel) => {
      ipcMain.removeHandler(channel);
    });
  };
};
