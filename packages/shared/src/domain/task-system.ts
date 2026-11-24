import { z } from 'zod';
import { TaskSystemConnectionIdSchema, UserIdSchema } from './ids';
import { EmailAddressSchema, IsoDateTimeSchema } from './primitives';

export const TASK_SYSTEM_PROVIDERS = ['jira', 'linear', 'github'] as const;

export const TaskSystemProviderSchema = z.enum(TASK_SYSTEM_PROVIDERS);
export type TaskSystemProvider = z.infer<typeof TaskSystemProviderSchema>;

export const AVAILABLE_TASK_SYSTEM_PROVIDERS: readonly TaskSystemProvider[] = [
  'jira',
  'linear',
  'github',
];

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
const SecretInputSchema = z.string().trim().min(1).max(1024);
const SecretSchema = z.string().min(1).max(1024);

export const JiraConnectInputSchema = z.object({
  provider: z.literal('jira'),
  label: LabelInputSchema.optional(),
  siteUrl: z.string().trim().min(1).max(2048),
  email: z.string().trim().pipe(EmailAddressSchema),
  apiToken: SecretInputSchema,
});
export type JiraConnectInput = z.infer<typeof JiraConnectInputSchema>;

export const LinearConnectInputSchema = z.object({
  provider: z.literal('linear'),
  label: LabelInputSchema.optional(),
  apiKey: SecretInputSchema,
});
export type LinearConnectInput = z.infer<typeof LinearConnectInputSchema>;

export const GitHubConnectInputSchema = z.object({
  provider: z.literal('github'),
  label: LabelInputSchema.optional(),
  token: SecretInputSchema,
});
export type GitHubConnectInput = z.infer<typeof GitHubConnectInputSchema>;

export const ConnectTaskSystemInputSchema = z.discriminatedUnion('provider', [
  JiraConnectInputSchema,
  LinearConnectInputSchema,
  GitHubConnectInputSchema,
]);
export type ConnectTaskSystemInput = z.infer<typeof ConnectTaskSystemInputSchema>;

export const JiraRouteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('site') }),
  z.object({ kind: z.literal('gateway'), cloudId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) }),
]);
export type JiraRoute = z.infer<typeof JiraRouteSchema>;

export const JiraCredentialsSchema = z.object({
  provider: z.literal('jira'),
  email: EmailAddressSchema,
  apiToken: SecretSchema,
  route: JiraRouteSchema.optional(),
});
export type JiraCredentials = z.infer<typeof JiraCredentialsSchema>;

export const LinearCredentialsSchema = z.object({
  provider: z.literal('linear'),
  apiKey: SecretSchema,
});
export type LinearCredentials = z.infer<typeof LinearCredentialsSchema>;

export const GitHubCredentialsSchema = z.object({
  provider: z.literal('github'),
  token: SecretSchema,
});
export type GitHubCredentials = z.infer<typeof GitHubCredentialsSchema>;

export const TaskSystemCredentialsSchema = z.discriminatedUnion('provider', [
  JiraCredentialsSchema,
  LinearCredentialsSchema,
  GitHubCredentialsSchema,
]);
export type TaskSystemCredentials = z.infer<typeof TaskSystemCredentialsSchema>;

export type TaskSystemCredentialsOf<Provider extends TaskSystemProvider> = Extract<
  TaskSystemCredentials,
  { readonly provider: Provider }
>;

export const isCredentialsOf = <Provider extends TaskSystemProvider>(
  credentials: TaskSystemCredentials,
  provider: Provider,
): credentials is TaskSystemCredentialsOf<Provider> => credentials.provider === provider;
