import { Button } from '@relay/ui';
import { ApplyToExisting, BLOCKED } from './ApplyToExisting';
import { type EditableRule, isComplete, isStaged } from './editable-rule';

export interface RuleDetailFooterProps {
  readonly rule: EditableRule;
  readonly disabled: boolean;
  readonly dirty: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onRemove: () => void;
}

export function RuleDetailFooter({
  rule,
  disabled,
  dirty,
  onSave,
  onDiscard,
  onRemove,
}: RuleDetailFooterProps) {
  const { input } = rule;
  const staged = isStaged(rule);
  return (
    <footer className="au-foot">
      {(!rule.saved || staged) && isComplete(rule) ? (
        <>
          <Button variant="primary" disabled={disabled || dirty} onClick={onSave}>
            Uložiť pravidlo
          </Button>
          {dirty ? <span className="au-note">{BLOCKED}</span> : null}
        </>
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
