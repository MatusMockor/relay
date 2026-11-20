import { Switch } from '@relay/ui';
import { SectionBackButton } from '../SectionHeader';
import { type EditableRule, isStaged, type RuleChange } from './editable-rule';
import { RuleName } from './RuleName';

export interface RuleDetailHeaderProps {
  readonly rule: EditableRule;
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onChange: (change: RuleChange) => void;
}

export function RuleDetailHeader({ rule, disabled, onBack, onChange }: RuleDetailHeaderProps) {
  const { input } = rule;
  return (
    <header className="sh-head au-dh">
      <SectionBackButton label="Automatizácie" ariaLabel="Späť na automatizácie" onBack={onBack} />
      <div className="au-dt">
        <h2>
          <RuleName
            name={input.name}
            disabled={disabled}
            onRename={(name) => {
              onChange({ name });
            }}
          />
        </h2>
        {rule.preset === null ? null : <span className="scope">Predvolené</span>}
        {rule.saved && !isStaged(rule) ? null : <span className="scope warn">Neuložené</span>}
        <Switch
          checked={input.enabled}
          label={`Pravidlo ${input.name} zapnuté`}
          disabled={disabled}
          onChange={(enabled) => {
            onChange({ enabled });
          }}
        />
      </div>
    </header>
  );
}
