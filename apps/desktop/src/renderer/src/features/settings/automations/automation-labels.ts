import type {
  AutomationAction,
  AutomationCondition,
  AutomationConditionType,
  JiraEventKind,
} from '@relay/shared';

export const ACTION_LABELS: Readonly<Record<AutomationAction, string>> = {
  summary: 'AI zhrnutie',
  task: 'Vytvoriť úlohu',
  notify: 'Notifikácia',
  markRead: 'Označiť ako prečítané',
  pin: 'Pripnúť',
  archive: 'Archivovať',
};

export const ACTIONS: readonly AutomationAction[] = [
  'summary',
  'task',
  'notify',
  'markRead',
  'pin',
  'archive',
];

export const JIRA_EVENT_LABELS: Readonly<Record<JiraEventKind, string>> = {
  mention: 'Spomenutie',
  assigned: 'Priradenie',
  comment: 'Komentár',
  status: 'Zmena stavu',
  other: 'Iné',
};

export const CONDITION_TYPE_LABELS: Readonly<Record<AutomationConditionType, string>> = {
  fromAddress: 'Od adresy',
  fromDomain: 'Z domény',
  subjectRegex: 'Predmet',
  header: 'Hlavička',
  jira: 'Jira projekt',
  jiraEvent: 'Jira udalosť',
};

export const describeCondition = (condition: AutomationCondition): string => {
  if (condition.type === 'fromAddress') {
    return `od ${condition.address}`;
  }
  if (condition.type === 'fromDomain') {
    return `z domény ${condition.domain}`;
  }
  if (condition.type === 'subjectRegex') {
    return `predmet obsahuje ${condition.pattern}`;
  }
  if (condition.type === 'header') {
    return `${condition.name} obsahuje ${condition.pattern}`;
  }
  if (condition.type === 'jira') {
    return condition.projectKeys.length === 0
      ? 'z Jiry'
      : `projekt je ${condition.projectKeys.join(', ')}`;
  }
  return `Jira udalosť je ${JIRA_EVENT_LABELS[condition.kind]}`;
};
