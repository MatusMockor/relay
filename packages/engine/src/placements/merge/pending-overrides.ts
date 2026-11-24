import type { MessageFlags } from '@relay/shared/domain';
import type { PendingFlagOverrides, PendingOverrides } from '../../model/message-merge';
import type { PendingWork } from '../../model/pending-work';

const byCreatedAt = (left: PendingWork, right: PendingWork): number =>
  Date.parse(left.createdAt) - Date.parse(right.createdAt);

export const pendingOverrides = (ops: readonly PendingWork<'provider-op'>[]): PendingOverrides => {
  const flags: { -readonly [Flag in keyof PendingFlagOverrides]: PendingFlagOverrides[Flag] } = {};
  const labels = new Map<string, boolean>();
  [...ops].sort(byCreatedAt).forEach(({ payload: { change } }) => {
    if (change.kind === 'flag') {
      flags[change.flag] = change.value;
      return;
    }
    if (change.kind === 'label') {
      labels.set(change.label, change.value);
    }
  });
  return { flags, labels };
};

export const overlayFlags = (flags: MessageFlags, overrides: PendingOverrides): MessageFlags => ({
  ...flags,
  ...overrides.flags,
});

export const overlayLabels = <LabelKey>(
  current: readonly LabelKey[],
  overrides: PendingOverrides,
  labelOf: (remoteName: string) => LabelKey | undefined,
): LabelKey[] => {
  const labels = new Set(current);
  overrides.labels.forEach((value, remoteName) => {
    const label = labelOf(remoteName);
    if (label === undefined) {
      return;
    }
    if (value) {
      labels.add(label);
      return;
    }
    labels.delete(label);
  });
  return [...labels];
};
