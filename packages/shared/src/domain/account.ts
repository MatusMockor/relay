import { z } from 'zod';
import { AccountIdSchema, UserIdSchema } from './ids';
import { EmailAddressSchema, HexColorSchema, IsoDateTimeSchema } from './primitives';

export const MailProviderKindSchema = z.enum(['imap', 'gmail', 'outlook']);
export type MailProviderKind = z.infer<typeof MailProviderKindSchema>;

export const OAuthProviderKindSchema = z.enum(['gmail', 'outlook']);
export type OAuthProviderKind = z.infer<typeof OAuthProviderKindSchema>;

export const AccountStatusSchema = z.enum(['connected', 'syncing', 'error', 'disconnected']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const ServerEndpointSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
});
export type ServerEndpoint = z.infer<typeof ServerEndpointSchema>;

export const ImapSmtpSettingsSchema = z.object({
  imap: ServerEndpointSchema,
  smtp: ServerEndpointSchema,
  username: z.string().min(1).max(320),
});
export type ImapSmtpSettings = z.infer<typeof ImapSmtpSettingsSchema>;

export const SYNC_INTERVAL_MIN_SECONDS = 30;
export const SYNC_INTERVAL_MAX_SECONDS = 86_400;

export const SyncIntervalSecondsSchema = z
  .number()
  .int()
  .min(SYNC_INTERVAL_MIN_SECONDS)
  .max(SYNC_INTERVAL_MAX_SECONDS);

export const MailAccountSchema = z.object({
  id: AccountIdSchema,
  userId: UserIdSchema,
  provider: MailProviderKindSchema,
  displayName: z.string().min(1).max(200),
  senderName: z.string().min(1).max(200).nullable(),
  email: EmailAddressSchema,
  color: HexColorSchema,
  isPrimary: z.boolean(),
  syncIntervalSeconds: SyncIntervalSecondsSchema,
  settings: ImapSmtpSettingsSchema,
  status: AccountStatusSchema,
  lastError: z.string().nullable(),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type MailAccount = z.infer<typeof MailAccountSchema>;
