import type { UserSettings, UserSettingsPatch } from './settings';

export const mergeUserSettings = (
  current: UserSettings,
  patch: UserSettingsPatch,
): UserSettings => ({
  notifications: patch.notifications ?? current.notifications,
  density: patch.density ?? current.density,
  ai: {
    location: patch.ai?.location ?? current.ai.location,
    defaultModel: patch.ai?.defaultModel ?? current.ai.defaultModel,
    backgroundModel: patch.ai?.backgroundModel ?? current.ai.backgroundModel,
    features: { ...current.ai.features, ...patch.ai?.features },
  },
  jira: {
    taskEvents: patch.jira?.taskEvents ?? current.jira.taskEvents,
  },
});
