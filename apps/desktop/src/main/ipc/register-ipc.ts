import {
  IPC_INVOKE,
  IPC_STREAM_CANCEL,
  IPC_STREAM_MESSAGE,
  IPC_STREAM_START,
  type IpcResult,
} from '@relay/shared/ipc';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { IpcInvokeRouter } from './invoke-router';
import type { IpcStreamRouter } from './stream-router';

export interface IpcRouters {
  readonly invoke: IpcInvokeRouter;
  readonly streams: IpcStreamRouter;
}

export type TrustedSenderPredicate = (frameUrl: string) => boolean;

const untrusted: IpcResult<never> = {
  ok: false,
  error: { code: 'forbidden', message: 'IPC sender is not trusted' },
};

export const registerIpc = (
  ipcMain: IpcMain,
  routers: IpcRouters,
  isTrustedSender: TrustedSenderPredicate,
): (() => void) => {
  const trusted = (event: IpcMainInvokeEvent): boolean =>
    isTrustedSender(event.senderFrame?.url ?? '');

  ipcMain.handle(IPC_INVOKE, (event: IpcMainInvokeEvent, envelope: unknown) => {
    if (!trusted(event)) {
      return untrusted;
    }
    return routers.invoke.dispatch(envelope);
  });
  ipcMain.handle(IPC_STREAM_START, (event: IpcMainInvokeEvent, envelope: unknown) => {
    if (!trusted(event)) {
      return untrusted;
    }
    const { sender } = event;
    return routers.streams.start(envelope, (message) => {
      if (sender.isDestroyed()) {
        routers.streams.cancel({ streamId: message.streamId });
        return;
      }
      sender.send(IPC_STREAM_MESSAGE, message);
    });
  });
  ipcMain.handle(IPC_STREAM_CANCEL, (event: IpcMainInvokeEvent, envelope: unknown) => {
    if (!trusted(event)) {
      return;
    }
    routers.streams.cancel(envelope);
  });
  return () => {
    routers.streams.cancelAll();
    [IPC_INVOKE, IPC_STREAM_START, IPC_STREAM_CANCEL].forEach((channel) => {
      ipcMain.removeHandler(channel);
    });
  };
};
