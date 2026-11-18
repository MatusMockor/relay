import { z } from 'zod';
import { AccountIdSchema } from '../domain/ids';
import { streamChannel } from './define';

export const SettingsSectionSchema = z.enum([
  'server',
  'account',
  'devices',
  'accounts',
  'splits',
  'labels',
  'automations',
  'jira',
  'sync',
  'notifications',
  'ai',
  'look',
  'keys',
  'calendars',
  'about',
]);
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;

export const AccountScopeSchema = z.union([z.literal('all'), AccountIdSchema]);
export type AccountScope = z.infer<typeof AccountScopeSchema>;

export const MenuCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('open-about') }),
  z.object({ command: z.literal('open-settings'), section: SettingsSectionSchema }),
  z.object({ command: z.literal('compose') }),
  z.object({ command: z.literal('select-scope'), scope: AccountScopeSchema }),
  z.object({ command: z.literal('navigate-back') }),
]);
export type MenuCommand = z.infer<typeof MenuCommandSchema>;
export type MenuCommandKind = MenuCommand['command'];

export const menuStreamChannels = {
  'app.menu.command': streamChannel(z.undefined(), MenuCommandSchema),
};
