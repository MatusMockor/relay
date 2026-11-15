import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { IpcStreamHandlers } from '../ipc/stream-router';

export const mergeInvokeHandlers = (...groups: IpcInvokeHandlers[]): IpcInvokeHandlers =>
  Object.assign({}, ...groups) as IpcInvokeHandlers;

export const mergeStreamHandlers = (...groups: IpcStreamHandlers[]): IpcStreamHandlers =>
  Object.assign({}, ...groups) as IpcStreamHandlers;
