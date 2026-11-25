import { z } from 'zod';
import { AiSettingsPatchSchema, AiSettingsSchema, DEFAULT_AI_SETTINGS } from './ai-settings';
import { AccountIdSchema } from './ids';
import { type JiraEventKind, JiraTaskEventsSchema } from './jira-event';
import { DEFAULT_OFFLINE_WINDOW, OfflineWindowSchema } from './offline-window';
import { ServerUrlSchema } from './primitives';
import { DEFAULT_THEME, ThemePreferenceSchema } from './theme';

export const NotificationModeSchema = z.enum(['off', 'digest', 'urgent']);
export type NotificationMode = z.infer<typeof NotificationModeSchema>;

export const DensitySchema = z.enum(['compact', 'normal']);
export type Density = z.infer<typeof DensitySchema>;

export const JiraSettingsSchema = z.object({
  taskEvents: JiraTaskEventsSchema,
});
export type JiraSettings = z.infer<typeof JiraSettingsSchema>;

export const DEFAULT_JIRA_TASK_EVENTS: readonly JiraEventKind[] = ['mention', 'assigned'];

const defaultJiraSettings = (): JiraSettings => ({ taskEvents: [...DEFAULT_JIRA_TASK_EVENTS] });

export const UserSettingsSchema = z.object({
  notifications: NotificationModeSchema,
  density: DensitySchema,
  ai: AiSettingsSchema,
  jira: JiraSettingsSchema.default(defaultJiraSettings),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserSettingsPatchSchema = z.object({
  notifications: NotificationModeSchema.optional(),
  density: DensitySchema.optional(),
  ai: AiSettingsPatchSchema.optional(),
  jira: JiraSettingsSchema.partial().optional(),
});
export type UserSettingsPatch = z.infer<typeof UserSettingsPatchSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: 'off',
  density: 'normal',
  ai: DEFAULT_AI_SETTINGS,
  jira: defaultJiraSettings(),
};

export const SavedServerSchema = z.object({
  name: z.string().min(1).max(100),
  url: ServerUrlSchema,
});
export type SavedServer = z.infer<typeof SavedServerSchema>;

export const AppModeSchema = z.enum(['local', 'synced']);
export type AppMode = z.infer<typeof AppModeSchema>;

export const PanelWidthsSchema = z.object({
  sidebar: z.number().int().min(120).max(800),
  list: z.number().int().min(240).max(1600),
  rightPanel: z.number().int().min(200).max(1000),
});
export type PanelWidths = z.infer<typeof PanelWidthsSchema>;

export const DeviceSettingsSchema = z.object({
  savedServers: z.array(SavedServerSchema),
  activeServerUrl: ServerUrlSchema.nullable(),
  mode: AppModeSchema.nullable(),
  panelWidths: PanelWidthsSchema,
  selectedAccountId: AccountIdSchema.nullable(),
  theme: ThemePreferenceSchema.default(DEFAULT_THEME),
  offlineWindow: OfflineWindowSchema.default(DEFAULT_OFFLINE_WINDOW),
});
export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>;

export const DeviceSettingsPatchSchema = z.object({
  savedServers: z.array(SavedServerSchema).optional(),
  activeServerUrl: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  mode: AppModeSchema.nullable().optional(),
  panelWidths: PanelWidthsSchema.partial().optional(),
  selectedAccountId: AccountIdSchema.nullable().optional(),
  theme: ThemePreferenceSchema.optional(),
  offlineWindow: OfflineWindowSchema.optional(),
});
export type DeviceSettingsPatch = z.infer<typeof DeviceSettingsPatchSchema>;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  savedServers: [],
  activeServerUrl: null,
  mode: null,
  panelWidths: { sidebar: 232, list: 420, rightPanel: 320 },
  selectedAccountId: null,
  theme: DEFAULT_THEME,
  offlineWindow: DEFAULT_OFFLINE_WINDOW,
};
