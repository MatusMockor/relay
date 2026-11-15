import {
  IPC_INVOKE,
  IPC_STREAM_CANCEL,
  IPC_STREAM_MESSAGE,
  IPC_STREAM_START,
  type IpcResult,
  type IpcStreamHandlers,
  IpcStreamMessageSchema,
  type RelayBridge,
} from '@relay/shared/ipc';

export type IpcRendererListener = (event: unknown, ...args: unknown[]) => void;

export interface IpcRendererPort {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: IpcRendererListener): void;
}

type AnyHandlers = IpcStreamHandlers<unknown>;

export const createRelayBridge = (ipc: IpcRendererPort, newStreamId: () => string): RelayBridge => {
  const streams = new Map<string, AnyHandlers>();

  ipc.on(IPC_STREAM_MESSAGE, (_event, payload) => {
    const parsed = IpcStreamMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;
    const handlers = streams.get(message.streamId);
    if (handlers === undefined) {
      return;
    }
    if (message.kind === 'event') {
      handlers.onEvent(message.event);
      return;
    }
    streams.delete(message.streamId);
    if (message.kind === 'end') {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(message.error);
  });

  const invoke = (channel: string, input: unknown) =>
    ipc.invoke(IPC_INVOKE, { channel, input }) as Promise<IpcResult<never>>;

  const subscribe = (channel: string, handlers: AnyHandlers, input: unknown) => {
    const streamId = newStreamId();
    streams.set(streamId, handlers);
    void (
      ipc.invoke(IPC_STREAM_START, { streamId, channel, input }) as Promise<IpcResult<unknown>>
    ).then((result) => {
      if (result.ok) {
        return;
      }
      streams.delete(streamId);
      handlers.onError?.(result.error);
    });
    return () => {
      if (!streams.delete(streamId)) {
        return;
      }
      void ipc.invoke(IPC_STREAM_CANCEL, { streamId });
    };
  };

  return {
    invoke: (channel, ...args) => invoke(channel, args[0]),
    subscribe: (channel, handlers, ...args) => subscribe(channel, handlers as AnyHandlers, args[0]),
  };
};
