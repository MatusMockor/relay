import { z } from 'zod';
import { AiRunnerKindSchema, AiRunnerLocationSchema } from './ai';
import { AccountIdSchema } from './ids';

export const NotificationModeSchema = z.enum(['off', 'digest', 'urgent']);
export type NotificationMode = z.infer<typeof NotificationModeSchema>;

export const DensitySchema = z.enum(['compact', 'normal']);
export type Density = z.infer<typeof DensitySchema>;

export const AiFeaturesSchema = z.object({
  oneLiners: z.boolean(),
  summaries: z.boolean(),
  replySuggestions: z.boolean(),
  jiraTriage: z.boolean(),
});
export type AiFeatures = z.infer<typeof AiFeaturesSchema>;

export const AiSettingsSchema = z.object({
  location: AiRunnerLocationSchema,
  defaultRunner: AiRunnerKindSchema,
  features: AiFeaturesSchema,
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const UserSettingsSchema = z.object({
  notifications: NotificationModeSchema,
  density: DensitySchema,
  ai: AiSettingsSchema,
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserSettingsPatchSchema = z.object({
  notifications: NotificationModeSchema.optional(),
  density: DensitySchema.optional(),
  ai: z
    .object({
      location: AiRunnerLocationSchema.optional(),
      defaultRunner: AiRunnerKindSchema.optional(),
      features: AiFeaturesSchema.partial().optional(),
    })
    .optional(),
});
export type UserSettingsPatch = z.infer<typeof UserSettingsPatchSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: 'urgent',
  density: 'normal',
  ai: {
    location: 'local',
    defaultRunner: 'claude',
    features: { oneLiners: true, summaries: true, replySuggestions: true, jiraTriage: true },
  },
};

export const SavedServerSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.url({ protocol: /^https?$/ }),
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
  activeServerUrl: z.url({ protocol: /^https?$/ }).nullable(),
  mode: AppModeSchema.nullable(),
  panelWidths: PanelWidthsSchema,
  selectedAccountId: AccountIdSchema.nullable(),
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
});
export type DeviceSettingsPatch = z.infer<typeof DeviceSettingsPatchSchema>;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  savedServers: [],
  activeServerUrl: null,
  mode: null,
  panelWidths: { sidebar: 232, list: 420, rightPanel: 320 },
  selectedAccountId: null,
};
