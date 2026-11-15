import { z } from 'zod';
import { ApiErrorBodySchema, type ApiErrorBody } from '../api/errors';

export const IPC_INVOKE = 'relay:invoke';
export const IPC_STREAM_START = 'relay:stream:start';
export const IPC_STREAM_CANCEL = 'relay:stream:cancel';
export const IPC_STREAM_MESSAGE = 'relay:stream:message';

export type IpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiErrorBody };

export const IpcStreamIdSchema = z.string().min(1).max(128);

export const IpcInvokeEnvelopeSchema = z.object({
  channel: z.string().min(1),
  input: z.unknown(),
});
export type IpcInvokeEnvelope = z.infer<typeof IpcInvokeEnvelopeSchema>;

export const IpcStreamStartEnvelopeSchema = z.object({
  streamId: IpcStreamIdSchema,
  channel: z.string().min(1),
  input: z.unknown(),
});
export type IpcStreamStartEnvelope = z.infer<typeof IpcStreamStartEnvelopeSchema>;

export const IpcStreamCancelEnvelopeSchema = z.object({ streamId: IpcStreamIdSchema });
export type IpcStreamCancelEnvelope = z.infer<typeof IpcStreamCancelEnvelopeSchema>;

export const IpcStreamMessageSchema = z.discriminatedUnion('kind', [
  z.object({ streamId: IpcStreamIdSchema, kind: z.literal('event'), event: z.unknown() }),
  z.object({ streamId: IpcStreamIdSchema, kind: z.literal('end') }),
  z.object({ streamId: IpcStreamIdSchema, kind: z.literal('error'), error: ApiErrorBodySchema }),
]);
export type IpcStreamMessage = z.infer<typeof IpcStreamMessageSchema>;
