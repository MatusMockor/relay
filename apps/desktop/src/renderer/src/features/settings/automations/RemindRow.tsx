import type { AutomationAction, AutomationActionOf } from '@relay/shared';
import { conflictOf, replaceAction, replaceNoteOf, withoutAction } from './action-choices';
import {
  DEFAULT_REMIND_DAYS,
  daysLabel,
  REMIND_DAY_OPTIONS,
  REMIND_IDLE_LABEL,
  remindLabel,
} from './action-params';
import { CheckRow } from './CheckRow';

export interface RemindRowProps {
  readonly actions: readonly AutomationAction[];
  readonly disabled: boolean;
  readonly onApply: (next: AutomationAction[] | null) => void;
}

const isRemind = (action: AutomationAction): action is AutomationActionOf<'remind'> =>
  action.type === 'remind';

export function RemindRow({ actions, disabled, onApply }: RemindRowProps) {
  const remind = actions.find(isRemind) ?? null;
  return (
    <CheckRow
      label={remind === null ? REMIND_IDLE_LABEL : remindLabel(remind.afterDays)}
      checked={remind !== null}
      note={remind === null ? replaceNoteOf(actions, 'remind') : null}
      disabled={disabled}
      onToggle={() => {
        if (remind !== null) {
          onApply(withoutAction(actions, remind));
          return;
        }
        onApply(
          replaceAction(actions, conflictOf(actions, 'remind'), {
            type: 'remind',
            afterDays: DEFAULT_REMIND_DAYS,
          }),
        );
      }}
    >
      {remind === null ? null : (
        <select
          className="au-target au-days"
          aria-label="Počet dní do pripomenutia"
          value={remind.afterDays}
          disabled={disabled}
          onChange={(event) => {
            onApply(
              replaceAction(actions, remind, {
                type: 'remind',
                afterDays: Number(event.target.value),
              }),
            );
          }}
        >
          {REMIND_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {daysLabel(days)}
            </option>
          ))}
        </select>
      )}
    </CheckRow>
  );
}
