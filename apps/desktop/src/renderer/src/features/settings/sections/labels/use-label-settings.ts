import type { Label, UpdateLabelBody } from '@relay/shared';
import { describeError } from '../../../../data/errors';
import { useDeleteLabel, useUpdateLabel } from '../../../../data/hooks/use-label-mutations';
import { showToast } from '../../../../state/toast-store';

export interface LabelSettings {
  readonly update: (label: Label, patch: UpdateLabelBody) => Promise<boolean>;
  readonly remove: (label: Label) => void;
}

export const useLabelSettings = (): LabelSettings => {
  const update = useUpdateLabel();
  const remove = useDeleteLabel();
  return {
    update: (label, patch) =>
      update
        .mutateAsync({ labelId: label.id, patch })
        .then(() => true)
        .catch((error: unknown) => {
          showToast(describeError(error));
          return false;
        }),
    remove: (label) => {
      remove.mutate(label.id, {
        onSuccess: () => {
          showToast(`Štítok „${label.name}“ je zmazaný`);
        },
        onError: (error) => {
          showToast(describeError(error));
        },
      });
    },
  };
};
