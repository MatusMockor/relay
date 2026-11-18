import type { AccountId, AutomationAction, MailAccount } from '@relay/shared';
import { Fragment } from 'react';
import { replaceAction } from './action-choices';
import { actionKey, type ActionTargets, describeAction } from './action-targets';
import { ActionMenu } from './ActionMenu';
import { TokenPopover } from './TokenPopover';

export interface ActionChange {
  readonly actions: AutomationAction[];
  readonly accountId?: AccountId;
}

export interface ActionTokensProps {
  readonly actions: readonly AutomationAction[];
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onChange: (change: ActionChange) => void;
  readonly onEngage: () => void;
}

export function ActionTokens({
  actions,
  accountId,
  accounts,
  targets,
  disabled,
  onChange,
  onEngage,
}: ActionTokensProps) {
  const menu = (title: string, current: AutomationAction | null, close: () => void) => (
    <ActionMenu
      title={title}
      actions={actions}
      current={current}
      accountId={accountId}
      accounts={accounts}
      onPick={(next, pickedAccount) => {
        close();
        const updated = replaceAction(actions, current, next);
        onChange(
          pickedAccount === null || pickedAccount === accountId
            ? { actions: updated }
            : { actions: updated, accountId: pickedAccount },
        );
      }}
    />
  );
  return (
    <>
      {actions.map((action) => {
        const view = describeAction(action, targets);
        const group = actions.length > 1 ? 'tk-g a' : 'tk-g a solo';
        return (
          <Fragment key={actionKey(action)}>
            <span className={view.broken ? `${group} broken` : group}>
              <TokenPopover
                className="tk a"
                label={`Zmeniť akciu ${view.label}`}
                popoverLabel="Zmeniť akciu"
                content={view.label}
                disabled={disabled}
                onOpen={onEngage}
              >
                {(close) => menu('Zmeniť na', action, close)}
              </TokenPopover>
              {actions.length > 1 ? (
                <button
                  type="button"
                  className="tk-x"
                  aria-label={`Odstrániť akciu ${view.label}`}
                  disabled={disabled}
                  onClick={() => {
                    onEngage();
                    onChange({ actions: actions.filter((item) => item !== action) });
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>{' '}
          </Fragment>
        );
      })}
      <TokenPopover
        className="tk add"
        label="Pridať akciu"
        popoverLabel="Nová akcia"
        content="+ akcia"
        disabled={disabled}
        onOpen={onEngage}
      >
        {(close) => menu('Akcia', null, close)}
      </TokenPopover>
    </>
  );
}
