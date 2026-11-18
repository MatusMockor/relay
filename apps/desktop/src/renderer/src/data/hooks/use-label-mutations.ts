import type { CreateLabelBody, Label, LabelId, UpdateLabelBody } from '@relay/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

const writeLabels = (
  queryClient: QueryClient,
  change: (labels: readonly Label[]) => Label[],
): void => {
  queryClient.setQueryData<Label[]>(queryKeys.labels(), (labels) =>
    labels === undefined ? labels : change(labels),
  );
};

const upsert = (queryClient: QueryClient, label: Label): void => {
  writeLabels(queryClient, (labels) =>
    labels.some((item) => item.id === label.id)
      ? labels.map((item) => (item.id === label.id ? label : item))
      : [...labels, label],
  );
};

export const useCreateLabel = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLabelBody) => client.createLabel(body),
    onSuccess: (label) => {
      upsert(queryClient, label);
    },
  });
};

export interface UpdateLabelInput {
  readonly labelId: LabelId;
  readonly patch: UpdateLabelBody;
}

export const useUpdateLabel = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, patch }: UpdateLabelInput) => client.updateLabel(labelId, patch),
    onSuccess: (label) => {
      upsert(queryClient, label);
    },
  });
};

export const useDeleteLabel = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labelId: LabelId) => client.deleteLabel(labelId),
    onSuccess: (_result, labelId) => {
      writeLabels(queryClient, (labels) => labels.filter((label) => label.id !== labelId));
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadDetails() });
    },
  });
};
