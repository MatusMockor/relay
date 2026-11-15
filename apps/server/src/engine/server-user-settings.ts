import { DEFAULT_USER_SETTINGS, type UserSettings } from '@relay/shared/domain';

export const SERVER_DEFAULT_USER_SETTINGS: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  ai: { ...DEFAULT_USER_SETTINGS.ai, location: 'server' },
};
