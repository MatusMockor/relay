import type { z } from 'zod';
import { appInvokeChannels, appStreamChannels } from './app-channels';
import { attachmentInvokeChannels } from './attachment-channels';
import { contextMenuInvokeChannels } from './context-menu-channels';
import { localInvokeChannels, localStreamChannels } from './local-channels';
import { menuStreamChannels } from './menu-channels';
import { notificationInvokeChannels, notificationStreamChannels } from './notification-channels';
import { calendarInvokeChannels } from './calendar-channels';
import { googleCalendarInvokeChannels } from './google-calendar-channels';
import { oauthInvokeChannels } from './oauth-channels';
import { sessionInvokeChannels } from './session-channels';
import { trayInvokeChannels } from './tray-channels';
import { updateInvokeChannels, updateStreamChannels } from './update-channels';
import { windowStreamChannels } from './window-channels';

export const ipcInvokeChannels = {
  ...appInvokeChannels,
  ...oauthInvokeChannels,
  ...sessionInvokeChannels,
  ...calendarInvokeChannels,
  ...googleCalendarInvokeChannels,
  ...localInvokeChannels,
  ...attachmentInvokeChannels,
  ...updateInvokeChannels,
  ...trayInvokeChannels,
  ...notificationInvokeChannels,
  ...contextMenuInvokeChannels,
};
export const ipcStreamChannels = {
  ...appStreamChannels,
  ...localStreamChannels,
  ...updateStreamChannels,
  ...notificationStreamChannels,
  ...menuStreamChannels,
  ...windowStreamChannels,
};

export type IpcInvokeChannels = typeof ipcInvokeChannels;
export type IpcStreamChannels = typeof ipcStreamChannels;
export type IpcInvokeChannel = keyof IpcInvokeChannels;
export type IpcStreamChannel = keyof IpcStreamChannels;

export type IpcInvokeInput<C extends IpcInvokeChannel> = z.input<IpcInvokeChannels[C]['input']>;
export type IpcInvokeParsedInput<C extends IpcInvokeChannel> = z.output<
  IpcInvokeChannels[C]['input']
>;
export type IpcInvokeOutput<C extends IpcInvokeChannel> = z.output<IpcInvokeChannels[C]['output']>;

export type IpcStreamInput<C extends IpcStreamChannel> = z.input<IpcStreamChannels[C]['input']>;
export type IpcStreamParsedInput<C extends IpcStreamChannel> = z.output<
  IpcStreamChannels[C]['input']
>;
export type IpcStreamEvent<C extends IpcStreamChannel> = z.output<IpcStreamChannels[C]['event']>;

export type IpcInvokeArgs<C extends IpcInvokeChannel> = [IpcInvokeInput<C>] extends [undefined]
  ? []
  : [input: IpcInvokeInput<C>];

export type IpcStreamArgs<C extends IpcStreamChannel> = [IpcStreamInput<C>] extends [undefined]
  ? []
  : [input: IpcStreamInput<C>];

export const isIpcInvokeChannel = (value: string): value is IpcInvokeChannel =>
  Object.hasOwn(ipcInvokeChannels, value);

export const isIpcStreamChannel = (value: string): value is IpcStreamChannel =>
  Object.hasOwn(ipcStreamChannels, value);
