import type { MailAccount } from '@relay/shared';
import { AutomationRow } from './AutomationRow';
import type { EditableRule } from './editable-rule';
import { useRowDrag } from './use-row-drag';

export interface AutomationListProps {
  readonly rules: readonly EditableRule[];
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onOpen: (key: string) => void;
  readonly onToggle: (key: string, enabled: boolean) => void;
  readonly onMove: (from: number, to: number) => void;
}

export function AutomationList({
  rules,
  accounts,
  disabled,
  onOpen,
  onToggle,
  onMove,
}: AutomationListProps) {
  const drag = useRowDrag({
    keys: rules.filter((rule) => rule.saved).map((rule) => rule.key),
    disabled,
    onMove,
  });
  return (
    <ul className="au-list" role="list" aria-label="Pravidlá">
      {rules.map((rule, index) => (
        <AutomationRow
          key={rule.key}
          rule={rule}
          accounts={accounts}
          index={index}
          disabled={disabled}
          place={drag.place(index)}
          focusHandle={drag.moved === rule.key}
          handle={drag.handle(index)}
          target={drag.target(index)}
          onOpen={() => {
            onOpen(rule.key);
          }}
          onToggle={(enabled) => {
            onToggle(rule.key, enabled);
          }}
        />
      ))}
    </ul>
  );
}
