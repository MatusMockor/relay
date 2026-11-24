import type { TaskSystemAdapterRegistry } from '@relay/engine';
import {
  GitHubIssuesAdapter,
  type GitHubIssuesAdapterOptions,
} from './github/github-issues-adapter';
import { JiraCloudAdapter, type JiraCloudAdapterOptions } from './jira/jira-cloud-adapter';
import { LinearAdapter, type LinearAdapterOptions } from './linear/linear-adapter';
import { StaticTaskSystemRegistry } from './static-task-system-registry';

export interface TaskSystemRegistryOptions {
  readonly jira?: JiraCloudAdapterOptions;
  readonly linear?: LinearAdapterOptions;
  readonly github?: GitHubIssuesAdapterOptions;
}

export const createTaskSystemRegistry = (
  options: TaskSystemRegistryOptions = {},
): TaskSystemAdapterRegistry =>
  new StaticTaskSystemRegistry([
    new JiraCloudAdapter(options.jira),
    new LinearAdapter(options.linear),
    new GitHubIssuesAdapter(options.github),
  ]);
