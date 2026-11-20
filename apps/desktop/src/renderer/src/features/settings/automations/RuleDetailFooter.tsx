import { Button } from '@relay/ui';
import { ApplyToExisting } from './ApplyToExisting';
import { type EditableRule, isComplete, isStaged, type RuleChange } from './editable-rule';

export interface RuleDetailFooterProps {
  readonly rule: EditableRule;
  readonly disabled: boolean;
  readonly dirty: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onDiscard: () => void;
  readonly onRemove: () => void;
}

export function RuleDetailFooter({
  rule,
  disabled,
  dirty,
  onChange,
  onDiscard,
  onRemove,
}: RuleDetailFooterProps) {
  const { input } = rule;
  const staged = isStaged(rule);
  return (
    <footer className="au-foot">
      {(!rule.saved || staged) && isComplete(rule) ? (
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => {
            onChange({});
          }}
        >
          Uložiť pravidlo
        </Button>
      ) : null}
      {staged ? (
        <Button disabled={disabled} onClick={onDiscard}>
          Zahodiť návrh
        </Button>
      ) : null}
      {rule.saved && !staged && input.id !== undefined ? (
        <ApplyToExisting
          automationId={input.id}
          actions={input.actions}
          disabled={disabled}
          blocked={dirty}
        />
      ) : null}
      <Button variant="danger" disabled={disabled} onClick={onRemove}>
        Odstrániť pravidlo
      </Button>
    </footer>
  );
}
