import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { TokenPairSchema } from '../api/endpoints/auth';
import { invokeChannel } from './define';

const ServerUrlSchema = z
  .string()
  .max(2_000)
  .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value), 'Invalid server URL');

const ServerSessionInputSchema = z.object({ serverUrl: ServerUrlSchema });

export const SessionAccessTokenInputSchema = ServerSessionInputSchema.extend({
  rejected: z.string().min(1).nullable().optional(),
});
export type SessionAccessTokenInput = z.infer<typeof SessionAccessTokenInputSchema>;

export const SessionAccessSchema = z.object({
  accessToken: z.string().min(1).nullable(),
  expired: z.boolean(),
});
export type SessionAccess = z.infer<typeof SessionAccessSchema>;

export const sessionInvokeChannels = {
  'session.getAccessToken': invokeChannel(SessionAccessTokenInputSchema, SessionAccessSchema),
  'session.setTokens': invokeChannel(
    ServerSessionInputSchema.extend({ tokens: TokenPairSchema }),
    OkResponseSchema,
  ),
  'session.clear': invokeChannel(ServerSessionInputSchema, OkResponseSchema),
  'session.hasTokens': invokeChannel(ServerSessionInputSchema, z.object({ signedIn: z.boolean() })),
};
