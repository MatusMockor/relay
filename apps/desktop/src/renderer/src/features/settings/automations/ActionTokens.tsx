import type { AutomationAction } from '@relay/shared';
import { Fragment } from 'react';
import { ACTION_LABELS, ACTIONS } from './automation-labels';
import { OptionList } from './OptionList';
import { TokenPopover } from './TokenPopover';

export interface ActionTokensProps {
  readonly actions: readonly AutomationAction[];
  readonly disabled: boolean;
  readonly onChange: (actions: AutomationAction[]) => void;
  readonly onEngage: () => void;
}

export function ActionTokens({ actions, disabled, onChange, onEngage }: ActionTokensProps) {
  const unused = ACTIONS.filter((action) => !actions.includes(action));
  const choices = (pick: (action: AutomationAction) => void, close: () => void) =>
    unused.map((action) => ({
      key: action,
      label: ACTION_LABELS[action],
      pick: () => {
        close();
        pick(action);
      },
    }));
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action}>
          <span className={actions.length > 1 ? 'tk-g a' : 'tk-g a solo'}>
            <TokenPopover
              className="tk a"
              label={`Zmeniť akciu ${ACTION_LABELS[action]}`}
              popoverLabel="Zmeniť akciu"
              content={ACTION_LABELS[action]}
              disabled={disabled || unused.length === 0}
              onOpen={onEngage}
            >
              {(close) => (
                <OptionList
                  title="Zmeniť na"
                  options={choices((next) => {
                    onChange(actions.map((item) => (item === action ? next : item)));
                  }, close)}
                />
              )}
            </TokenPopover>
            {actions.length > 1 ? (
              <button
                type="button"
                className="tk-x"
                aria-label={`Odstrániť akciu ${ACTION_LABELS[action]}`}
                disabled={disabled}
                onClick={() => {
                  onEngage();
                  onChange(actions.filter((item) => item !== action));
                }}
              >
                ×
              </button>
            ) : null}
          </span>{' '}
        </Fragment>
      ))}
      {unused.length === 0 ? null : (
        <TokenPopover
          className="tk add"
          label="Pridať akciu"
          popoverLabel="Nová akcia"
          content="+ akcia"
          disabled={disabled}
          onOpen={onEngage}
        >
          {(close) => (
            <OptionList
              title="Akcia"
              options={choices((action) => {
                onChange([...actions, action]);
              }, close)}
            />
          )}
        </TokenPopover>
      )}
    </>
  );
}
