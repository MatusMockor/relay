import { UserSettingsPatchSchema, UserSettingsSchema } from '../../domain/settings';
import { defineEndpoint } from '../endpoint';

export const settingsEndpoints = {
  get: defineEndpoint({
    method: 'GET',
    path: '/settings',
    auth: 'user',
    response: UserSettingsSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/settings',
    auth: 'user',
    body: UserSettingsPatchSchema,
    response: UserSettingsSchema,
  }),
};
