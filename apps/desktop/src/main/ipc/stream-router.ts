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
  readonly channel: IpcStreamChannel;
  readonly controller: AbortController;
  readonly sink: IpcStreamSink;
}

export class IpcStreamRouter {
  private readonly active = new Map<string, AbortController>();

  constructor(private readonly handlers: IpcStreamHandlers) {}

  start(envelope: unknown, sink: IpcStreamSink): StartResult {
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
    const controller = new AbortController();
    this.active.set(streamId, controller);
    void this.pump(
      { streamId, channel, controller, sink },
      handler(parsedInput.data, controller.signal),
    );
    return { ok: true, data: { ok: true } };
  }

  cancel(envelope: unknown): void {
    const parsed = IpcStreamCancelEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return;
    }
    this.active.get(parsed.data.streamId)?.abort();
  }

  cancelAll(): void {
    this.active.forEach((controller) => {
      controller.abort();
    });
  }

  private async pump(stream: ActiveStream, events: AsyncIterable<unknown>): Promise<void> {
    const { streamId, channel, controller, sink } = stream;
    const eventSchema = ipcStreamChannels[channel].event;
    try {
      for await (const event of events) {
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
