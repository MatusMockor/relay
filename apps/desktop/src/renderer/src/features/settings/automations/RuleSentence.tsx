import { Icon } from '@relay/ui';
import type { AccountId, MailAccount } from '@relay/shared';
import type { ActionTargets } from './action-targets';
import { ActionTokens } from './ActionTokens';
import { ConditionTokens } from './ConditionTokens';
import { type EditableRule, type RuleChange, scopeChange } from './editable-rule';
import { OptionList } from './OptionList';
import { TokenPopover } from './TokenPopover';

export interface RuleSentenceProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onEngage: () => void;
}

export function RuleSentence({
  rule,
  accounts,
  targets,
  disabled,
  onChange,
  onEngage,
}: RuleSentenceProps) {
  const { input } = rule;
  const account = accounts.find((item) => item.id === input.accountId) ?? null;
  const accountLabel = account?.displayName ?? 'všetky účty';
  const scopes: { readonly id: AccountId | null; readonly label: string }[] = [
    { id: null, label: 'Všetky účty' },
    ...accounts.map((item) => ({ id: item.id, label: item.displayName })),
  ];
  return (
    <div className="sent">
      <div className="sent-r">
        <span className="sent-l">Keď</span>
        <div className="sent-b">
          <span className="kw">na</span>{' '}
          <TokenPopover
            className="tk"
            label={`Účet: ${accountLabel}`}
            popoverLabel="Účet"
            content={
              <>
                {accountLabel}
                <Icon name="down" size={12} />
              </>
            }
            disabled={disabled}
            onOpen={onEngage}
          >
            {(close) => (
              <OptionList
                title="Účet"
                options={scopes.map((scope) => ({
                  key: scope.id ?? 'all',
                  label: scope.label,
                  checked: scope.id === input.accountId,
                  pick: () => {
                    close();
                    onChange(scopeChange(input.actions, input.accountId, scope.id));
                  },
                }))}
              />
            )}
          </TokenPopover>{' '}
          <span className="kw">príde mail, kde</span>{' '}
          <ConditionTokens
            conditions={input.conditions}
            disabled={disabled}
            onEngage={onEngage}
            onChange={(conditions) => {
              onChange({ conditions });
            }}
          />
        </div>
      </div>
      <div className="sent-r">
        <span className="sent-l">Potom</span>
        <div className="sent-b">
          <ActionTokens
            actions={input.actions}
            accountId={input.accountId}
            accounts={accounts}
            targets={targets}
            disabled={disabled}
            onEngage={onEngage}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}
