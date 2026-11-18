import { type JiraSettings, stripJiraSubject } from '@relay/shared/domain';
import type { JiraTaskEvent } from '../sync/jira-task-sink';

const MAX_TITLE_LENGTH = 500;

export const jiraTaskTitle = (event: JiraTaskEvent): string => {
  const title = stripJiraSubject(event.title, event.classification.jiraKey);
  return (title === '' ? event.classification.jiraKey : title).slice(0, MAX_TITLE_LENGTH);
};

export const routesJiraEventToTasks = (settings: JiraSettings, event: JiraTaskEvent): boolean =>
  settings.taskEvents.includes(event.classification.eventKind);
