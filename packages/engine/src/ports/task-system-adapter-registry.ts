import type { TaskSystemProvider } from '@relay/shared/domain';
import type { TaskSystemAdapter } from './task-system-adapter';

export interface TaskSystemAdapterRegistry {
  get(provider: TaskSystemProvider): TaskSystemAdapter | null;
}
