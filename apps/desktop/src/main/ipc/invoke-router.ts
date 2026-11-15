import { toApiErrorIssues } from '@relay/shared/api';
import {
  type IpcInvokeChannel,
  ipcInvokeChannels,
  IpcInvokeEnvelopeSchema,
  type IpcInvokeOutput,
  type IpcInvokeParsedInput,
  type IpcResult,
  isIpcInvokeChannel,
} from '@relay/shared/ipc';
import { toApiError } from './to-api-error';

export type IpcInvokeHandler<C extends IpcInvokeChannel> = (
  input: IpcInvokeParsedInput<C>,
) => Promise<IpcInvokeOutput<C>> | IpcInvokeOutput<C>;

export type IpcInvokeHandlers = { readonly [C in IpcInvokeChannel]?: IpcInvokeHandler<C> };

type AnyHandler = (input: unknown) => unknown;

export class IpcInvokeRouter {
  constructor(private readonly handlers: IpcInvokeHandlers) {}

  async dispatch(envelope: unknown): Promise<IpcResult<unknown>> {
    const parsedEnvelope = IpcInvokeEnvelopeSchema.safeParse(envelope);
    if (!parsedEnvelope.success) {
      return this.fail('validation_failed', 'Malformed IPC request');
    }
    const { channel, input } = parsedEnvelope.data;
    if (!isIpcInvokeChannel(channel)) {
      return this.fail('not_found', `Unknown IPC channel "${channel}"`);
    }
    const handler = this.handlers[channel] as AnyHandler | undefined;
    if (handler === undefined) {
      return this.fail('not_implemented', `IPC channel "${channel}" is not implemented yet`);
    }
    const definition = ipcInvokeChannels[channel];
    const parsedInput = definition.input.safeParse(input);
    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: 'validation_failed',
          message: `Invalid input for "${channel}"`,
          issues: toApiErrorIssues(parsedInput.error),
        },
      };
    }
    return this.run(channel, handler, parsedInput.data);
  }

  private async run(
    channel: IpcInvokeChannel,
    handler: AnyHandler,
    input: unknown,
  ): Promise<IpcResult<unknown>> {
    try {
      const output: unknown = await handler(input);
      const parsedOutput = ipcInvokeChannels[channel].output.safeParse(output);
      if (!parsedOutput.success) {
        return this.fail('internal', `Handler for "${channel}" returned an invalid result`);
      }
      return { ok: true, data: parsedOutput.data };
    } catch (error) {
      return { ok: false, error: toApiError(error) };
    }
  }

  private fail(
    code: 'validation_failed' | 'not_found' | 'not_implemented' | 'internal',
    message: string,
  ) {
    return { ok: false, error: { code, message } } as const;
  }
}
