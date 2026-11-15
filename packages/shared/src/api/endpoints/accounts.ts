import { z } from 'zod';
import {
  ImapSmtpSettingsSchema,
  MailAccountSchema,
  SyncIntervalSecondsSchema,
} from '../../domain/account';
import { AccountIdSchema } from '../../domain/ids';
import { MailboxSchema } from '../../domain/mailbox';
import { EmailAddressSchema, HexColorSchema } from '../../domain/primitives';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

const AccountPreferencesSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  color: HexColorSchema.optional(),
  isPrimary: z.boolean().optional(),
  syncIntervalSeconds: SyncIntervalSecondsSchema.optional(),
});

export const OAuthGrantSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128).nullable(),
  redirectUri: z.url(),
});
export type OAuthGrant = z.infer<typeof OAuthGrantSchema>;

export const CreateImapAccountBodySchema = AccountPreferencesSchema.extend({
  provider: z.literal('imap'),
  email: EmailAddressSchema,
  settings: ImapSmtpSettingsSchema,
  password: z.string().min(1),
});

export const CreateGmailAccountBodySchema = AccountPreferencesSchema.extend({
  provider: z.literal('gmail'),
  oauth: OAuthGrantSchema,
});

export const CreateOutlookAccountBodySchema = AccountPreferencesSchema.extend({
  provider: z.literal('outlook'),
  oauth: OAuthGrantSchema,
});

export const CreateAccountBodySchema = z.discriminatedUnion('provider', [
  CreateImapAccountBodySchema,
  CreateGmailAccountBodySchema,
  CreateOutlookAccountBodySchema,
]);
export type CreateAccountBody = z.infer<typeof CreateAccountBodySchema>;

export const UpdateAccountBodySchema = AccountPreferencesSchema.extend({
  settings: ImapSmtpSettingsSchema.optional(),
  password: z.string().min(1).optional(),
});
export type UpdateAccountBody = z.infer<typeof UpdateAccountBodySchema>;

export const TestConnectionBodySchema = z.object({
  settings: ImapSmtpSettingsSchema,
  password: z.string().min(1),
});
export type TestConnectionBody = z.infer<typeof TestConnectionBodySchema>;

export const ConnectionCheckSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type ConnectionCheck = z.infer<typeof ConnectionCheckSchema>;

export const TestConnectionResponseSchema = z.object({
  imap: ConnectionCheckSchema,
  smtp: ConnectionCheckSchema,
});
export type TestConnectionResponse = z.infer<typeof TestConnectionResponseSchema>;

export const OAuthStartQuerySchema = z.object({ loginHint: EmailAddressSchema.optional() });
export const OAuthStartResponseSchema = z.object({
  authorizationUrl: z.url(),
  state: z.string().min(16),
});
export type OAuthStartResponse = z.infer<typeof OAuthStartResponseSchema>;

export const OAuthCallbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1).optional(),
  error: z.string().optional(),
});
export const OAuthCallbackResponseSchema = z.object({ accountId: AccountIdSchema });

const accountIdParams = idParamsOf(AccountIdSchema);

export const accountsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/accounts',
    auth: 'user',
    response: z.array(MailAccountSchema),
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/accounts',
    auth: 'user',
    body: CreateAccountBodySchema,
    response: MailAccountSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/accounts/:id',
    auth: 'user',
    params: accountIdParams,
    body: UpdateAccountBodySchema,
    response: MailAccountSchema,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/accounts/:id',
    auth: 'user',
    params: accountIdParams,
    response: OkResponseSchema,
  }),
  testConnection: defineEndpoint({
    method: 'POST',
    path: '/accounts/test-connection',
    auth: 'user',
    body: TestConnectionBodySchema,
    response: TestConnectionResponseSchema,
  }),
  mailboxes: defineEndpoint({
    method: 'GET',
    path: '/accounts/:id/mailboxes',
    auth: 'user',
    params: accountIdParams,
    response: z.array(MailboxSchema),
  }),
};

export const oauthEndpoints = {
  googleStart: defineEndpoint({
    method: 'GET',
    path: '/oauth/google/start',
    auth: 'user',
    query: OAuthStartQuerySchema,
    response: OAuthStartResponseSchema,
  }),
  googleCallback: defineEndpoint({
    method: 'GET',
    path: '/oauth/google/callback',
    auth: 'public',
    query: OAuthCallbackQuerySchema,
    response: OAuthCallbackResponseSchema,
  }),
};
