import type { TaskSystemAdapterRegistry } from '@relay/engine';
import { JiraCloudAdapter, type JiraCloudAdapterOptions } from './jira/jira-cloud-adapter';
import { StaticTaskSystemRegistry } from './static-task-system-registry';

export interface TaskSystemRegistryOptions {
  readonly jira?: JiraCloudAdapterOptions;
}

export const createTaskSystemRegistry = (
  options: TaskSystemRegistryOptions = {},
): TaskSystemAdapterRegistry => new StaticTaskSystemRegistry([new JiraCloudAdapter(options.jira)]);
