import type { MailAccount, RuleSuggestion } from '@relay/shared';
import { Button } from '@relay/ui';
import { useState } from 'react';
import { RuleAiBar } from './rule-ai/RuleAiBar';

export interface DescribeRuleProps {
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onNew: () => void;
  readonly onSuggest: (suggestion: RuleSuggestion, sentence: string) => void;
}

export function DescribeRule({ accounts, disabled, onNew, onSuggest }: DescribeRuleProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="au-bar">
        <span>Pravidlá sa vyhodnocujú zhora nadol. Poradie zmeníš potiahnutím.</span>
        <div className="au-bar-acts">
          <Button
            disabled={disabled}
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
          >
            Opíš nové pravidlo…
          </Button>
          <Button variant="primary" disabled={disabled} onClick={onNew}>
            + Nové pravidlo
          </Button>
        </div>
      </div>
      {open ? (
        <RuleAiBar
          accountId={null}
          accounts={accounts}
          disabled={disabled}
          note={null}
          focus
          onSuggest={onSuggest}
        />
      ) : null}
    </>
  );
}
