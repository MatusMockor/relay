import type { ApiErrorBody } from '../api/errors';
import type {
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeOutput,
  IpcStreamArgs,
  IpcStreamChannel,
  IpcStreamEvent,
} from './channels';
import type { IpcResult } from './protocol';

export const RELAY_BRIDGE_KEY = 'relay';

export interface IpcStreamHandlers<Event> {
  readonly onEvent: (event: Event) => void;
  readonly onEnd?: () => void;
  readonly onError?: (error: ApiErrorBody) => void;
}

export type IpcUnsubscribe = () => void;

export interface RelayBridge {
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    ...args: IpcInvokeArgs<C>
  ): Promise<IpcResult<IpcInvokeOutput<C>>>;
  subscribe<C extends IpcStreamChannel>(
    channel: C,
    handlers: IpcStreamHandlers<IpcStreamEvent<C>>,
    ...args: IpcStreamArgs<C>
  ): IpcUnsubscribe;
}
