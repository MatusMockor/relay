import type { TaskSystemAdapterRegistry } from './task-system-adapter-registry';
import type { TaskSystemSecretStore } from './task-system-secret-store';

export interface TaskSystemAdapters {
  readonly registry: TaskSystemAdapterRegistry;
  readonly secrets: TaskSystemSecretStore;
}
