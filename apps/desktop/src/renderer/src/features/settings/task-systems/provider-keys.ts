import {
  isTaskSystemProviderAvailable,
  TASK_SYSTEM_PROVIDERS,
  type TaskSystemProvider,
} from '@relay/shared';

const STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const AVAILABLE = TASK_SYSTEM_PROVIDERS.filter(isTaskSystemProviderAvailable);

export const providerForKey = (
  key: string,
  current: TaskSystemProvider,
): TaskSystemProvider | null => {
  const step = STEP[key];
  if (step === undefined || AVAILABLE.length === 0) {
    return null;
  }
  const index = Math.max(AVAILABLE.indexOf(current), 0);
  return AVAILABLE[(index + step + AVAILABLE.length) % AVAILABLE.length] ?? null;
};
