import type { AccountId, MailAccount } from '@relay/shared';
import { ActionTokens } from './ActionTokens';
import { ConditionTokens } from './ConditionTokens';
import type { EditableRule, RuleChange } from './editable-rule';
import { OptionList } from './OptionList';
import { TokenPopover } from './TokenPopover';

export interface RuleSentenceProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onEngage: () => void;
}

export function RuleSentence({ rule, accounts, disabled, onChange, onEngage }: RuleSentenceProps) {
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
                <span className="cv" />
              </>
            }
            disabled={disabled || rule.preset !== null}
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
                    onChange({ accountId: scope.id });
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
            disabled={disabled}
            onEngage={onEngage}
            onChange={(actions) => {
              onChange({ actions });
            }}
          />
        </div>
      </div>
    </div>
  );
}
