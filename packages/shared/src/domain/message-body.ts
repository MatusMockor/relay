import { z } from 'zod';

const bodyFields = {
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
};

export const MessageBodyResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('local'), ...bodyFields }),
  z.object({ status: z.literal('ok'), ...bodyFields }),
  z.object({ status: z.literal('offline') }),
  z.object({ status: z.literal('gone') }),
]);
export type MessageBodyResult = z.infer<typeof MessageBodyResultSchema>;

export type MessageBodyContent = Extract<MessageBodyResult, { readonly status: 'local' | 'ok' }>;

export const hasMessageBody = (result: MessageBodyResult): result is MessageBodyContent =>
  result.status === 'local' || result.status === 'ok';
