import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { OAuthGrantSchema } from '../api/endpoints/accounts';
import { MailAccountSchema } from '../domain/account';
import { EmailAddressSchema } from '../domain/primitives';
import { AppModeSchema } from '../domain/settings';
import { invokeChannel } from './define';

export const GoogleAuthorizeInputSchema = z.object({
  mode: AppModeSchema,
  loginHint: EmailAddressSchema.optional(),
  calendar: z.boolean().optional(),
});
export type GoogleAuthorizeInput = z.infer<typeof GoogleAuthorizeInputSchema>;

export const GoogleAuthorizeOutputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local'), account: MailAccountSchema }),
  z.object({ mode: z.literal('synced'), grant: OAuthGrantSchema }),
]);
export type GoogleAuthorizeOutput = z.infer<typeof GoogleAuthorizeOutputSchema>;

export const oauthInvokeChannels = {
  'oauth.google.authorize': invokeChannel(GoogleAuthorizeInputSchema, GoogleAuthorizeOutputSchema),
  'oauth.google.cancel': invokeChannel(z.undefined(), OkResponseSchema),
};
