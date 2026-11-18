import type {
  AutomationCondition,
  AutomationConditionType,
  JiraEventKind,
  RecipientField,
} from '@relay/shared';
import { Button, Field } from '@relay/ui';
import { useState } from 'react';
import {
  CONDITION_TYPE_LABELS,
  JIRA_EVENT_LABELS,
  RECIPIENT_FIELD_LABELS,
} from './automation-labels';
import { type ConditionDraft, conditionOf, draftOf, EMPTY_CONDITION } from './condition-draft';

const TYPES = Object.keys(CONDITION_TYPE_LABELS) as AutomationConditionType[];
const KINDS = Object.keys(JIRA_EVENT_LABELS) as JiraEventKind[];
const FIELDS = Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[];

const VALUE_LABELS: Partial<Record<AutomationConditionType, [string, string]>> = {
  fromAddress: ['Adresa', 'tibor@firma.sk'],
  fromDomain: ['Doména', 'firma.sk'],
  header: ['Hlavička', 'List-Id'],
  jira: ['Projekty', 'ECOM, OPS (prázdne = všetky)'],
  recipient: ['Adresa alebo doména', 'faktury@firma.sk alebo firma.sk'],
};

export interface ConditionFormProps {
  readonly initial: AutomationCondition | null;
  readonly onSave: (condition: AutomationCondition) => void;
}

export function ConditionForm({ initial, onSave }: ConditionFormProps) {
  const [draft, setDraft] = useState<ConditionDraft>(
    initial === null ? EMPTY_CONDITION : draftOf(initial),
  );
  const [invalid, setInvalid] = useState(false);
  const set = (change: Partial<ConditionDraft>) => {
    setInvalid(false);
    setDraft((current) => ({ ...current, ...change }));
  };
  const valueLabel = VALUE_LABELS[draft.type];
  const usesPattern = draft.type === 'subjectRegex' || draft.type === 'header';
  const save = () => {
    const condition = conditionOf(draft);
    if (condition === null) {
      setInvalid(true);
      return;
    }
    onSave(condition);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="fld">
        <span>Podmienka</span>
        <select
          value={draft.type}
          onChange={(event) => {
            set({ type: event.target.value as AutomationConditionType });
          }}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {CONDITION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      {draft.type === 'jiraEvent' ? (
        <label className="fld">
          <span>Udalosť</span>
          <select
            value={draft.kind}
            onChange={(event) => {
              set({ kind: event.target.value as JiraEventKind });
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {JIRA_EVENT_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {draft.type === 'recipient' ? (
        <label className="fld">
          <span>Pole</span>
          <select
            value={draft.field}
            onChange={(event) => {
              set({ field: event.target.value as RecipientField });
            }}
          >
            {FIELDS.map((field) => (
              <option key={field} value={field}>
                {RECIPIENT_FIELD_LABELS[field]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {valueLabel === undefined ? null : (
        <Field
          label={valueLabel[0]}
          placeholder={valueLabel[1]}
          value={draft.value}
          onChange={(event) => {
            set({ value: event.target.value });
          }}
        />
      )}
      {usesPattern ? (
        <Field
          label="Obsahuje (regulárny výraz)"
          placeholder="faktúra|objednávka"
          value={draft.pattern}
          onChange={(event) => {
            set({ pattern: event.target.value });
          }}
        />
      ) : null}
      {invalid ? <p className="au-hint">Doplň podmienku správne.</p> : null}
      <div className="btns">
        <Button type="submit" variant="primary">
          {initial === null ? 'Pridať' : 'Uložiť'}
        </Button>
      </div>
    </form>
  );
}
