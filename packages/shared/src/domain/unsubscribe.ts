import { z } from 'zod';
import { EmailAddressSchema } from './primitives';

const onDefaultPortWithoutCredentials = (value: string): boolean => {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.username === '' && url.password === '' && url.port === '';
};

export const UnsubscribeUrlSchema = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain })
  .max(2_048)
  .refine(onDefaultPortWithoutCredentials);
export type UnsubscribeUrl = z.infer<typeof UnsubscribeUrlSchema>;

export const UnsubscribeMailtoSchema = z.object({
  to: EmailAddressSchema,
  subject: z.string().max(500).nullable(),
  body: z.string().max(5_000).nullable(),
});
export type UnsubscribeMailto = z.infer<typeof UnsubscribeMailtoSchema>;

export const UnsubscribeOptionsSchema = z.object({
  oneClick: z.boolean(),
  url: UnsubscribeUrlSchema.nullable(),
  mailto: UnsubscribeMailtoSchema.nullable(),
});
export type UnsubscribeOptions = z.infer<typeof UnsubscribeOptionsSchema>;

export const UnsubscribeRequestSchema = z.object({ url: UnsubscribeUrlSchema });
export type UnsubscribeRequest = z.infer<typeof UnsubscribeRequestSchema>;

export const NO_UNSUBSCRIBE: UnsubscribeOptions = { oneClick: false, url: null, mailto: null };
