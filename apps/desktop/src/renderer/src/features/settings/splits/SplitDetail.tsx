import type { MailAccount, Split } from '@relay/shared';
import { Button } from '@relay/ui';
import { useState } from 'react';
import { AdvancedSection } from '../automations/AdvancedSection';
import { NEW_CONDITION_TYPE } from '../automations/condition-fields';
import { ExceptionsSection } from '../automations/ExceptionsSection';
import { liveConditions } from '../automations/live-rule';
import { useConditionRows } from '../automations/use-condition-rows';
import { useDirtyRows } from '../automations/use-dirty-rows';
import { useLiveDrafts } from '../automations/use-live-drafts';
import { splitInputOf, toSplitRules } from '../../../data/split-input';
import {
  missingRule,
  SPLIT_CONDITION_TYPES,
  type SplitChange,
  type SplitDraft,
} from './split-draft';
import { describeSplit } from './split-summary';
import { SplitDetailHeader } from './SplitDetailHeader';
import { SplitOptions } from './SplitOptions';
import { SplitPreview } from './SplitPreview';
import { SplitWhenSection } from './SplitWhenSection';

const EXCEPTIONS_LEAD =
  'ak platí niektorá výnimka. Taký mail do splitu nepôjde, aj keď spĺňa podmienky.';

export interface SplitDetailProps {
  readonly split: Split;
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onSave: (draft: SplitDraft, settled: () => void) => void;
  readonly onRemove: () => void;
}

export function SplitDetail({
  split,
  accounts,
  disabled,
  onBack,
  onSave,
  onRemove,
}: SplitDetailProps) {
  const [pending, setPending] = useState<SplitDraft | null>(null);
  const draft = pending ?? splitInputOf(split);
  const ruleRows = useConditionRows(
    draft.rules,
    draft.rules.length === 0 ? NEW_CONDITION_TYPE : null,
  );
  const exceptionRows = useConditionRows(draft.exceptions, null);
  const dirty = useDirtyRows();
  const live = useLiveDrafts();
  const tracker = { onDirty: dirty.mark, onLive: live.report };
  const previewDraft: SplitDraft = {
    ...draft,
    rules: toSplitRules(liveConditions(draft.rules, ruleRows.rows, live.drafts)),
    exceptions: toSplitRules(liveConditions(draft.exceptions, exceptionRows.rows, live.drafts)),
  };
  const account = accounts.find((item) => item.id === draft.accountId);
  const missing = missingRule(draft);
  const change = (update: SplitChange) => {
    if (disabled) {
      return;
    }
    const next = { ...draft, ...update };
    setPending(next);
    if (missingRule(next) !== null) {
      return;
    }
    onSave(next, () => {
      setPending(null);
    });
  };
  return (
    <section className="au-detail" aria-label={`Split ${draft.name}`}>
      <SplitDetailHeader
        name={draft.name}
        unsaved={missing !== null}
        disabled={disabled}
        onBack={onBack}
        onRename={(name) => {
          change({ name });
        }}
      />
      <section className="au-summary" aria-label="Zhrnutie splitu">
        <p>
          <b>Zhrnutie:</b> {describeSplit(draft, account?.displayName ?? null)}
        </p>
      </section>
      <SplitPreview draft={previewDraft} />
      <SplitWhenSection
        draft={draft}
        accounts={accounts}
        rows={ruleRows}
        disabled={disabled}
        onChange={change}
        tracker={tracker}
      />
      <ExceptionsSection
        exceptions={draft.exceptions}
        rows={exceptionRows}
        disabled={disabled}
        types={SPLIT_CONDITION_TYPES}
        lead={EXCEPTIONS_LEAD}
        onChange={(update) => {
          if (update.exceptions !== undefined) {
            change({ exceptions: toSplitRules(update.exceptions) });
          }
        }}
        tracker={tracker}
      />
      <AdvancedSection
        disabled={disabled}
        canAdd={{ conditions: ruleRows.canAdd, exceptions: exceptionRows.canAdd }}
        onAdd={(target, type) => {
          (target === 'exceptions' ? exceptionRows : ruleRows).addPending(type);
        }}
      />
      <SplitOptions draft={draft} disabled={disabled} onChange={change} />
      {missing === null ? null : (
        <p className="au-hint" role="status">
          {missing}
        </p>
      )}
      <footer className="au-foot">
        <Button variant="danger" disabled={disabled} onClick={onRemove}>
          Odstrániť split
        </Button>
      </footer>
    </section>
  );
}
