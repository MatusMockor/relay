import type { TaskSystemAdapter, TaskSystemAdapterRegistry } from '@relay/engine';
import type { TaskSystemProvider } from '@relay/shared/domain';

export class StaticTaskSystemRegistry implements TaskSystemAdapterRegistry {
  private readonly adapters: ReadonlyMap<TaskSystemProvider, TaskSystemAdapter>;

  constructor(adapters: readonly TaskSystemAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  get(provider: TaskSystemProvider): TaskSystemAdapter | null {
    return this.adapters.get(provider) ?? null;
  }
}
