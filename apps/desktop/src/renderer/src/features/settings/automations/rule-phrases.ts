import type {
  AutomationAction,
  AutomationCondition,
  RecipientField,
  SimpleAutomationActionType,
} from '@relay/shared';
import { moveTargetsOf } from '../../mail/move-targets';
import type { ActionTargets } from './action-targets';
import { JIRA_EVENT_LABELS } from './automation-labels';
import { isNewsletterHeader } from './newsletter-condition';

const RECIPIENT_PHRASES: Readonly<Record<RecipientField, (value: string) => string>> = {
  to: (value) => `pre ${value}`,
  cc: (value) => `s kópiou pre ${value}`,
  any: (value) => `s príjemcom ${value}`,
};

const SIMPLE_ACTION_PHRASES: Readonly<Record<SimpleAutomationActionType, string>> = {
  summary: 'pripraví AI zhrnutie',
  task: 'vytvorí úlohu',
  notify: 'pošle notifikáciu',
  markRead: 'označí ho ako prečítaný',
  pin: 'pripne ho',
  archive: 'archivuje ho',
};

export const conditionPhrase = (condition: AutomationCondition): string => {
  switch (condition.type) {
    case 'fromAddress':
      return `od ${condition.address}`;
    case 'fromDomain':
      return `z domény ${condition.domain}`;
    case 'subjectContains':
      return `so slovom „${condition.value}“ v predmete`;
    case 'subjectRegex':
      return `s predmetom podľa výrazu ${condition.pattern}`;
    case 'header':
      if (isNewsletterHeader(condition)) {
        return 'z newslettra';
      }
      return `s hlavičkou ${condition.name} podľa výrazu ${condition.pattern}`;
    case 'jira':
      return condition.projectKeys.length === 0
        ? 'z Jiry'
        : `z Jira projektu ${condition.projectKeys.join(', ')}`;
    case 'jiraEvent':
      return `s Jira udalosťou ${JIRA_EVENT_LABELS[condition.kind].toLocaleLowerCase('sk')}`;
    case 'recipient':
      return RECIPIENT_PHRASES[condition.field](condition.value);
    case 'hasAttachment':
      return 's prílohou';
  }
};

export const actionPhrase = (action: AutomationAction, targets: ActionTargets): string => {
  if (action.type === 'addLabel') {
    const label = targets.labels.find((item) => item.id === action.labelId);
    return label === undefined ? 'pridá štítok' : `pridá štítok ${label.name}`;
  }
  if (action.type === 'moveTo') {
    const target = moveTargetsOf(targets.mailboxes).find(
      (item) => item.mailbox.id === action.mailboxId,
    );
    return target === undefined ? 'presunie ho' : `presunie ho do ${target.label}`;
  }
  return SIMPLE_ACTION_PHRASES[action.type];
};

export const joinPhrases = (phrases: readonly string[], conjunction: 'a' | 'alebo'): string => {
  const last = phrases.at(-1);
  if (phrases.length < 2 || last === undefined) {
    return last ?? '';
  }
  return `${phrases.slice(0, -1).join(', ')} ${conjunction} ${last}`;
};
