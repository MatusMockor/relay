import type { AutomationCondition } from '@relay/shared';
import { Fragment } from 'react';
import { describeCondition } from './automation-labels';
import { ConditionForm } from './ConditionForm';
import { TokenPopover } from './TokenPopover';

export interface ConditionTokensProps {
  readonly conditions: readonly AutomationCondition[];
  readonly disabled: boolean;
  readonly onChange: (conditions: AutomationCondition[]) => void;
  readonly onEngage: () => void;
}

export function ConditionTokens({
  conditions,
  disabled,
  onChange,
  onEngage,
}: ConditionTokensProps) {
  const replace = (index: number, condition: AutomationCondition) => {
    onChange(conditions.map((item, position) => (position === index ? condition : item)));
  };
  return (
    <>
      {conditions.map((condition, index) => (
        <Fragment key={`${condition.type}-${String(index)}`}>
          {index > 0 ? (
            <>
              <span className="kw">a</span>{' '}
            </>
          ) : null}
          <span className="tk-g c">
            <TokenPopover
              className="tk c"
              label={`Upraviť podmienku ${describeCondition(condition)}`}
              popoverLabel="Upraviť podmienku"
              content={describeCondition(condition)}
              disabled={disabled}
              onOpen={onEngage}
            >
              {(close) => (
                <ConditionForm
                  initial={condition}
                  onSave={(next) => {
                    close();
                    replace(index, next);
                  }}
                />
              )}
            </TokenPopover>
            <button
              type="button"
              className="tk-x"
              aria-label={`Odstrániť podmienku ${describeCondition(condition)}`}
              disabled={disabled}
              onClick={() => {
                onEngage();
                onChange(conditions.filter((_, position) => position !== index));
              }}
            >
              ×
            </button>
          </span>{' '}
        </Fragment>
      ))}
      <TokenPopover
        className="tk add"
        label="Pridať podmienku"
        popoverLabel="Nová podmienka"
        content="+ podmienka"
        disabled={disabled}
        onOpen={onEngage}
      >
        {(close) => (
          <ConditionForm
            initial={null}
            onSave={(condition) => {
              close();
              onChange([...conditions, condition]);
            }}
          />
        )}
      </TokenPopover>
    </>
  );
}
