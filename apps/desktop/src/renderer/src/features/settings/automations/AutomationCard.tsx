import type { MailAccount } from '@relay/shared';
import { IconButton, Icon, Switch } from '@relay/ui';
import { describeAction } from './action-targets';
import { ApplyToExisting } from './ApplyToExisting';
import { isComplete, type EditableRule, type RuleChange } from './editable-rule';
import { InstructionsBox } from './InstructionsBox';
import { ModelPicker } from './ModelPicker';
import { RuleName } from './RuleName';
import { RuleSentence } from './RuleSentence';
import { useActionTargets } from './use-action-targets';

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
  const targets = useActionTargets(input.accountId, accounts);
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
          {rule.preset !== null ? <span className="scope">Predvolené</span> : null}
        </b>
        {rule.preset === null ? (
          <IconButton
            label={`Odstrániť pravidlo ${input.name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Icon name="trash" />
          </IconButton>
        ) : (
          <span className="au-slot" title="Predvolené pravidlo sa nedá odstrániť, len vypnúť">
            <Icon name="lock" />
          </span>
        )}
        <Switch
          checked={input.enabled}
          label={`Pravidlo ${input.name} zapnuté`}
          disabled={disabled}
          onChange={(enabled) => {
            onEngage();
            onChange({ enabled });
          }}
        />
      </div>
      <RuleSentence
        rule={rule}
        accounts={accounts}
        targets={targets}
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
      <div className="au-f">
        <span>Model</span>
        <ModelPicker
          value={input.ai}
          disabled={disabled}
          onOpen={onEngage}
          onChange={(choice) => {
            onChange({ ai: { ...input.ai, ...choice } });
          }}
        />
        {rule.saved && input.id !== undefined ? (
          <ApplyToExisting
            automationId={input.id}
            name={input.name}
            actions={input.actions}
            disabled={disabled}
          />
        ) : null}
      </div>
      {input.actions.some((action) => describeAction(action, targets).broken) ? (
        <p className="au-hint" role="status">
          Cieľ niektorej akcie už neexistuje. Pravidlo ostatné akcie vykoná, túto preskočí.
        </p>
      ) : null}
      {isComplete(rule) ? null : (
        <p className="au-hint" role="status">
          Pridaj aspoň jednu podmienku, potom sa pravidlo uloží.
        </p>
      )}
    </section>
  );
}
