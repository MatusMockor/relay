import { CheckRow } from '../settings/automations/CheckRow';
import type { MailRuleOption, MailRuleOptionId } from './mail-rule-options';

export interface MailRuleOptionListProps {
  readonly options: readonly MailRuleOption[];
  readonly selected: ReadonlySet<MailRuleOptionId>;
  readonly disabled: boolean;
  readonly onToggle: (id: MailRuleOptionId) => void;
}

export function MailRuleOptionList({
  options,
  selected,
  disabled,
  onToggle,
}: MailRuleOptionListProps) {
  return (
    <div className="rfm-opts" role="group" aria-label="Podľa čoho rozpoznať maily">
      {options.map((option) => (
        <CheckRow
          key={option.id}
          label={option.label}
          checked={selected.has(option.id)}
          disabled={disabled}
          onToggle={() => {
            onToggle(option.id);
          }}
        />
      ))}
    </div>
  );
}
