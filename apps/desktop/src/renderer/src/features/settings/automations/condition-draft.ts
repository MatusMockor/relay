import {
  type AutomationCondition,
  AutomationConditionSchema,
  type AutomationConditionType,
  type JiraEventKind,
} from '@relay/shared';

export interface ConditionDraft {
  readonly type: AutomationConditionType;
  readonly value: string;
  readonly pattern: string;
  readonly kind: JiraEventKind;
}

export const EMPTY_CONDITION: ConditionDraft = {
  type: 'jiraEvent',
  value: '',
  pattern: '',
  kind: 'mention',
};

export const draftOf = (condition: AutomationCondition): ConditionDraft => {
  if (condition.type === 'fromAddress') {
    return { ...EMPTY_CONDITION, type: condition.type, value: condition.address };
  }
  if (condition.type === 'fromDomain') {
    return { ...EMPTY_CONDITION, type: condition.type, value: condition.domain };
  }
  if (condition.type === 'subjectRegex') {
    return { ...EMPTY_CONDITION, type: condition.type, pattern: condition.pattern };
  }
  if (condition.type === 'header') {
    return {
      ...EMPTY_CONDITION,
      type: condition.type,
      value: condition.name,
      pattern: condition.pattern,
    };
  }
  if (condition.type === 'jira') {
    return { ...EMPTY_CONDITION, type: condition.type, value: condition.projectKeys.join(', ') };
  }
  return { ...EMPTY_CONDITION, type: condition.type, kind: condition.kind };
};

const projectKeys = (value: string): string[] =>
  value
    .split(/[\s,]+/)
    .map((key) => key.trim().toUpperCase())
    .filter((key) => key !== '');

const candidateOf = (draft: ConditionDraft): unknown => {
  const value = draft.value.trim();
  const pattern = draft.pattern.trim();
  const shapes: Readonly<Record<AutomationConditionType, () => unknown>> = {
    fromAddress: () => ({ type: 'fromAddress', address: value }),
    fromDomain: () => ({ type: 'fromDomain', domain: value.replace(/^@/, '') }),
    subjectRegex: () => ({ type: 'subjectRegex', pattern, caseSensitive: false }),
    header: () => ({ type: 'header', name: value, pattern }),
    jira: () => ({ type: 'jira', projectKeys: projectKeys(value) }),
    jiraEvent: () => ({ type: 'jiraEvent', kind: draft.kind }),
  };
  return shapes[draft.type]();
};

export const conditionOf = (draft: ConditionDraft): AutomationCondition | null => {
  const parsed = AutomationConditionSchema.safeParse(candidateOf(draft));
  return parsed.success ? parsed.data : null;
};
