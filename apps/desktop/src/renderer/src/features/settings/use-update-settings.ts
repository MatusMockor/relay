import { mergeUserSettings, type UserSettings, type UserSettingsPatch } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';

const MUTATION_KEY = ['settings', 'update'] as const;

interface SettingsSnapshot {
  readonly previous: UserSettings | undefined;
}

export const useUpdateSettings = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const key = queryKeys.settings();
  return useMutation<UserSettings, Error, UserSettingsPatch, SettingsSnapshot>({
    mutationKey: MUTATION_KEY,
    scope: { id: 'user-settings' },
    mutationFn: (patch) => client.updateSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserSettings>(key);
      if (previous !== undefined) {
        queryClient.setQueryData(key, mergeUserSettings(previous, patch));
      }
      return { previous };
    },
    onSuccess: (settings) => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) {
        return;
      }
      queryClient.setQueryData(key, settings);
    },
    onError: (error, _patch, snapshot) => {
      if (snapshot?.previous !== undefined) {
        queryClient.setQueryData(key, snapshot.previous);
      }
      showToast(describeError(error));
    },
  });
};
