import type { TaskSystemAdapters } from '../../ports/task-system-adapters';

export const UNCONFIGURED_TASK_SYSTEMS: TaskSystemAdapters = {
  registry: { get: () => null },
  secrets: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  },
};
