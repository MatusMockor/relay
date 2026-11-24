import {
  type AccountId,
  type AutomationCondition,
  type SplitEntry,
  supportedSplits,
} from '@relay/shared';
import { Button, Field } from '@relay/ui';
import { useState } from 'react';
import { toSplitRules } from '../../data/split-input';
import { openSplitEditor } from '../settings/splits/split-view';
import { filedSplits, filingTargets, joinIssue, NEW_SPLIT } from './split-filing';
import { useFileToSplit } from './use-file-to-split';

export interface SplitFilingFormProps {
  readonly entries: readonly SplitEntry[];
  readonly accountId: AccountId;
  readonly conditions: readonly AutomationCondition[];
  readonly suggestedName: string;
  readonly onCancel: () => void;
  readonly onFiled: () => void;
}

export function SplitFilingForm({
  entries,
  accountId,
  conditions,
  suggestedName,
  onCancel,
  onFiled,
}: SplitFilingFormProps) {
  const targets = filingTargets(entries, accountId);
  const filing = useFileToSplit();
  const [choice, setChoice] = useState<string>(targets[0]?.id ?? NEW_SPLIT);
  const [name, setName] = useState(suggestedName);
  const rules = toSplitRules(conditions);
  const target = targets.find((split) => split.id === choice);
  const issue = target === undefined ? null : joinIssue(target, rules);
  const blank = target === undefined && name.trim() === '';
  const file = () => {
    if (target !== undefined) {
      filing.file(
        (fresh) => filedSplits(fresh, { kind: 'join', splitId: target.id }, rules),
        `Mail pôjde do splitu ${target.name}`,
        onFiled,
      );
      return;
    }
    const trimmed = name.trim();
    filing.file(
      (fresh) => filedSplits(fresh, { kind: 'new', name: trimmed, accountId }, rules),
      `Split ${trimmed} je vytvorený`,
      (stored, before) => {
        const known = new Set(before.map((entry) => entry.id));
        const created = supportedSplits(stored).find((split) => !known.has(split.id));
        if (created === undefined) {
          onFiled();
          return;
        }
        openSplitEditor(created.id);
      },
    );
  };
  return (
    <>
      <label className="fld">
        <span>Split</span>
        <select
          value={choice}
          disabled={filing.busy}
          onChange={(event) => {
            setChoice(event.target.value);
          }}
        >
          {targets.map((split) => (
            <option key={split.id} value={split.id}>
              {split.name}
            </option>
          ))}
          <option value={NEW_SPLIT}>Nový split…</option>
        </select>
      </label>
      {target === undefined ? (
        <Field
          label="Názov nového splitu"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      ) : null}
      {issue === null ? null : (
        <p className="rfm-lead" role="status">
          {issue}
        </p>
      )}
      <footer className="rfm-foot">
        <Button disabled={filing.busy} onClick={onCancel}>
          Späť
        </Button>
        <Button
          variant="primary"
          disabled={filing.busy || issue !== null || blank || rules.length === 0}
          onClick={file}
        >
          {filing.busy ? 'Ukladám…' : 'Zaradiť'}
        </Button>
      </footer>
    </>
  );
}
