import type { TaskSystemAdapterRegistry } from '@relay/engine';
import { JiraCloudAdapter, type JiraCloudAdapterOptions } from './jira/jira-cloud-adapter';
import { LinearAdapter, type LinearAdapterOptions } from './linear/linear-adapter';
import { StaticTaskSystemRegistry } from './static-task-system-registry';

export interface TaskSystemRegistryOptions {
  readonly jira?: JiraCloudAdapterOptions;
  readonly linear?: LinearAdapterOptions;
}

export const createTaskSystemRegistry = (
  options: TaskSystemRegistryOptions = {},
): TaskSystemAdapterRegistry =>
  new StaticTaskSystemRegistry([
    new JiraCloudAdapter(options.jira),
    new LinearAdapter(options.linear),
  ]);
