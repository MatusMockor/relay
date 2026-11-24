import { z } from 'zod';
import { TaskSystemConnectionIdSchema, UserIdSchema } from './ids';
import { EmailAddressSchema, IsoDateTimeSchema } from './primitives';

export const TASK_SYSTEM_PROVIDERS = ['jira', 'linear', 'github'] as const;

export const TaskSystemProviderSchema = z.enum(TASK_SYSTEM_PROVIDERS);
export type TaskSystemProvider = z.infer<typeof TaskSystemProviderSchema>;

export const AVAILABLE_TASK_SYSTEM_PROVIDERS: readonly TaskSystemProvider[] = ['jira'];

export const isTaskSystemProviderAvailable = (provider: TaskSystemProvider): boolean =>
  AVAILABLE_TASK_SYSTEM_PROVIDERS.includes(provider);

export const TaskSystemConnectionStatusSchema = z.enum(['ok', 'error']);
export type TaskSystemConnectionStatus = z.infer<typeof TaskSystemConnectionStatusSchema>;

export const TaskSystemSiteUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

export const TaskSystemConnectionSchema = z.object({
  id: TaskSystemConnectionIdSchema,
  userId: UserIdSchema,
  provider: TaskSystemProviderSchema,
  label: z.string().min(1).max(100),
  siteUrl: TaskSystemSiteUrlSchema,
  accountName: z.string().max(255),
  status: TaskSystemConnectionStatusSchema,
  lastError: z.string().max(1000).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TaskSystemConnection = z.infer<typeof TaskSystemConnectionSchema>;

const LabelInputSchema = z.string().trim().min(1).max(100);

export const JiraConnectInputSchema = z.object({
  provider: z.literal('jira'),
  label: LabelInputSchema.optional(),
  siteUrl: z.string().trim().min(1).max(2048),
  email: z.string().trim().pipe(EmailAddressSchema),
  apiToken: z.string().trim().min(1).max(1024),
});
export type JiraConnectInput = z.infer<typeof JiraConnectInputSchema>;

export const ConnectTaskSystemInputSchema = z.discriminatedUnion('provider', [
  JiraConnectInputSchema,
]);
export type ConnectTaskSystemInput = z.infer<typeof ConnectTaskSystemInputSchema>;

export const JiraCredentialsSchema = z.object({
  provider: z.literal('jira'),
  email: EmailAddressSchema,
  apiToken: z.string().min(1).max(1024),
});
export type JiraCredentials = z.infer<typeof JiraCredentialsSchema>;

export const TaskSystemCredentialsSchema = z.discriminatedUnion('provider', [
  JiraCredentialsSchema,
]);
export type TaskSystemCredentials = z.infer<typeof TaskSystemCredentialsSchema>;
