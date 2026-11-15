import { stripJiraSubject, type TaskState } from '@relay/shared/domain';
import type { JiraEventKind } from '../../model/jira';
import type { JiraTaskEvent } from '../sync/jira-task-sink';

const REOPENING_EVENTS: readonly JiraEventKind[] = ['mention', 'assigned', 'comment'];

const MAX_TITLE_LENGTH = 500;

export const jiraTaskTitle = (event: JiraTaskEvent): string => {
  const title = stripJiraSubject(event.title, event.classification.jiraKey);
  return (title === '' ? event.classification.jiraKey : title).slice(0, MAX_TITLE_LENGTH);
};

export const jiraTaskStateChange = (event: JiraTaskEvent): { readonly state?: TaskState } =>
  REOPENING_EVENTS.includes(event.classification.eventKind) ? { state: 'open' } : {};
