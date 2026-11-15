import {
  type IpcResult,
  type IpcStreamChannel,
  ipcStreamChannels,
  type IpcStreamEvent,
  type IpcStreamMessage,
  type IpcStreamParsedInput,
  IpcStreamCancelEnvelopeSchema,
  IpcStreamStartEnvelopeSchema,
  isIpcStreamChannel,
} from '@relay/shared/ipc';
import { toApiError } from './to-api-error';

export type IpcStreamHandler<C extends IpcStreamChannel> = (
  input: IpcStreamParsedInput<C>,
  signal: AbortSignal,
) => AsyncIterable<IpcStreamEvent<C>>;

export type IpcStreamHandlers = { readonly [C in IpcStreamChannel]?: IpcStreamHandler<C> };

export type IpcStreamSink = (message: IpcStreamMessage) => void;

type AnyStreamHandler = (input: unknown, signal: AbortSignal) => AsyncIterable<unknown>;

type StartResult = IpcResult<{ ok: true }>;

interface ActiveStream {
  readonly streamId: string;
  readonly ownerId: string;
  readonly channel: IpcStreamChannel;
  readonly controller: AbortController;
  readonly sink: IpcStreamSink;
}

export class IpcStreamRouter {
  private readonly active = new Map<string, ActiveStream>();

  constructor(private readonly handlers: IpcStreamHandlers) {}

  start(envelope: unknown, sink: IpcStreamSink, ownerId = 'default'): StartResult {
    const parsed = IpcStreamStartEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'validation_failed', message: 'Malformed stream request' },
      };
    }
    const { streamId, channel, input } = parsed.data;
    if (!isIpcStreamChannel(channel)) {
      return { ok: false, error: { code: 'not_found', message: `Unknown stream "${channel}"` } };
    }
    if (this.active.has(streamId)) {
      return {
        ok: false,
        error: { code: 'conflict', message: `Stream ${streamId} already exists` },
      };
    }
    const handler = this.handlers[channel] as AnyStreamHandler | undefined;
    if (handler === undefined) {
      const message = `Stream "${channel}" is not implemented yet`;
      return { ok: false, error: { code: 'not_implemented', message } };
    }
    const parsedInput = ipcStreamChannels[channel].input.safeParse(input);
    if (!parsedInput.success) {
      const message = `Invalid input for "${channel}"`;
      return { ok: false, error: { code: 'validation_failed', message } };
    }
    const stream: ActiveStream = {
      streamId,
      ownerId,
      channel,
      controller: new AbortController(),
      sink,
    };
    this.active.set(streamId, stream);
    void this.pump(stream, () => handler(parsedInput.data, stream.controller.signal));
    return { ok: true, data: { ok: true } };
  }

  cancel(envelope: unknown): void {
    const parsed = IpcStreamCancelEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return;
    }
    this.active.get(parsed.data.streamId)?.controller.abort();
  }

  cancelOwner(ownerId: string): void {
    this.active.forEach((stream) => {
      if (stream.ownerId !== ownerId) {
        return;
      }
      stream.controller.abort();
    });
  }

  cancelAll(): void {
    this.active.forEach((stream) => {
      stream.controller.abort();
    });
  }

  private async pump(stream: ActiveStream, open: () => AsyncIterable<unknown>): Promise<void> {
    const { streamId, channel, controller, sink } = stream;
    const eventSchema = ipcStreamChannels[channel].event;
    try {
      for await (const event of open()) {
        if (controller.signal.aborted) {
          break;
        }
        const parsed = eventSchema.safeParse(event);
        if (!parsed.success) {
          const message = `Stream "${channel}" produced an invalid event`;
          sink({ streamId, kind: 'error', error: { code: 'internal', message } });
          return;
        }
        sink({ streamId, kind: 'event', event: parsed.data });
      }
      sink({ streamId, kind: 'end' });
    } catch (error) {
      sink({ streamId, kind: 'error', error: toApiError(error) });
    } finally {
      this.active.delete(streamId);
    }
  }
}
