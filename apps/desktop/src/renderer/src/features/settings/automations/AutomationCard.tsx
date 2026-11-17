import type { MailAccount } from '@relay/shared';
import { IconButton, Icon, Switch } from '@relay/ui';
import { isComplete, type EditableRule, type RuleChange } from './editable-rule';
import { InstructionsBox } from './InstructionsBox';
import { ModelPicker } from './ModelPicker';
import { RuleName } from './RuleName';
import { RuleSentence } from './RuleSentence';

export interface AutomationCardProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly editing: boolean;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onRemove: () => void;
  readonly onEngage: () => void;
}

export function AutomationCard({
  rule,
  accounts,
  editing,
  disabled,
  onChange,
  onRemove,
  onEngage,
}: AutomationCardProps) {
  const { input } = rule;
  const account = accounts.find((item) => item.id === input.accountId) ?? null;
  return (
    <section className={editing ? 'au ed' : 'au'} aria-label={`Pravidlo ${input.name}`}>
      <div className="au-h">
        <b>
          <RuleName
            name={input.name}
            disabled={disabled}
            onEngage={onEngage}
            onRename={(name) => {
              onChange({ name });
            }}
          />
          {rule.preset !== null ? <span className="scope">predvolené</span> : null}
          {account === null ? null : <span className="scope synced">{account.displayName}</span>}
        </b>
        <ModelPicker
          value={input.ai}
          disabled={disabled}
          onOpen={onEngage}
          onChange={(choice) => {
            onChange({ ai: { ...input.ai, ...choice } });
          }}
        />
        <Switch
          checked={input.enabled}
          label={`Pravidlo ${input.name} zapnuté`}
          disabled={disabled}
          onChange={(enabled) => {
            onEngage();
            onChange({ enabled });
          }}
        />
        {rule.preset === null ? (
          <IconButton
            label={`Odstrániť pravidlo ${input.name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Icon name="trash" />
          </IconButton>
        ) : null}
      </div>
      <RuleSentence
        rule={rule}
        accounts={accounts}
        disabled={disabled}
        onChange={onChange}
        onEngage={onEngage}
      />
      <InstructionsBox
        value={input.ai.instructions}
        disabled={disabled}
        onEngage={onEngage}
        onSave={(instructions) => {
          onChange({ ai: { ...input.ai, instructions } });
        }}
      />
      {isComplete(rule) ? null : (
        <p className="au-hint" role="status">
          Pridaj aspoň jednu podmienku, potom sa pravidlo uloží.
        </p>
      )}
    </section>
  );
}
