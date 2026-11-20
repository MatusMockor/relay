import { type AccountId, type AutomationCondition, supportedSplits } from '@relay/shared';
import { Button, Field } from '@relay/ui';
import { useState } from 'react';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { toSplitRules } from '../../data/split-input';
import { openSplitEditor } from '../settings/splits/split-view';
import { filingTargets, joinedSplits, joinIssue, NEW_SPLIT, withNewSplit } from './split-filing';
import { useFileToSplit } from './use-file-to-split';

export interface SplitFilingProps {
  readonly accountId: AccountId;
  readonly conditions: readonly AutomationCondition[];
  readonly suggestedName: string;
  readonly onCancel: () => void;
  readonly onFiled: () => void;
}

export function SplitFiling({
  accountId,
  conditions,
  suggestedName,
  onCancel,
  onFiled,
}: SplitFilingProps) {
  const entries = useSplits().data ?? [];
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
        joinedSplits(entries, target, rules),
        `Mail pôjde do splitu ${target.name}`,
        onFiled,
      );
      return;
    }
    const trimmed = name.trim();
    const known = new Set(entries.map((entry) => entry.id));
    filing.file(
      withNewSplit(entries, trimmed, accountId, rules),
      `Split ${trimmed} je vytvorený`,
      (stored) => {
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
    <section className="rfm-split" aria-label="Zaradiť do splitu">
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
    </section>
  );
}
