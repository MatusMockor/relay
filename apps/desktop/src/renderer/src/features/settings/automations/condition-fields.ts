import type { AutomationConditionType, JiraEventKind, RecipientField } from '@relay/shared';
import {
  CONDITION_TYPE_LABELS,
  JIRA_EVENT_LABELS,
  RECIPIENT_FIELD_LABELS,
} from './automation-labels';
import { type ConditionDraft, EMPTY_CONDITION } from './condition-draft';

export const ADVANCED_CONDITION_TYPES: readonly AutomationConditionType[] = [
  'subjectRegex',
  'header',
];
export const CONDITION_TYPES = Object.keys(CONDITION_TYPE_LABELS) as AutomationConditionType[];
const BASIC_CONDITION_TYPES = CONDITION_TYPES.filter(
  (type) => !ADVANCED_CONDITION_TYPES.includes(type),
);

export const conditionTypesFor = (
  type: AutomationConditionType,
  allowed: readonly AutomationConditionType[] = CONDITION_TYPES,
): AutomationConditionType[] =>
  (ADVANCED_CONDITION_TYPES.includes(type) ? CONDITION_TYPES : BASIC_CONDITION_TYPES).filter(
    (option) => option === type || allowed.includes(option),
  );
export const JIRA_EVENT_KINDS = Object.keys(JIRA_EVENT_LABELS) as JiraEventKind[];
export const RECIPIENT_FIELDS = Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[];

export const VALUE_FIELDS: Partial<Record<AutomationConditionType, readonly [string, string]>> = {
  fromAddress: ['Adresa', 'tibor@firma.sk'],
  fromDomain: ['Doména', 'firma.sk'],
  subjectContains: ['Slovo v predmete', 'faktúra'],
  header: ['Hlavička', 'List-Id'],
  jira: ['Projekty', 'ECOM, OPS (prázdne = všetky)'],
  recipient: ['Adresa alebo doména', 'faktury@firma.sk alebo firma.sk'],
};

export const usesPattern = (type: AutomationConditionType): boolean =>
  type === 'subjectRegex' || type === 'header';

export const NEW_CONDITION_TYPE: AutomationConditionType = 'fromAddress';

export const freshDraft = (type: AutomationConditionType): ConditionDraft => ({
  ...EMPTY_CONDITION,
  type,
});

export const isBlank = (draft: ConditionDraft): boolean =>
  draft.value.trim() === '' && draft.pattern.trim() === '';
