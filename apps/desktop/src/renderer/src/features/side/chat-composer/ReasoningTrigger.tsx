import { AI_EFFORT_LABELS } from '@relay/shared';
import { cx, Icon } from '@relay/ui';
import { effectiveEffort, type ModelChoice } from '../../ai/model-choice/model-choice';
import { ReasoningMenu } from './ReasoningMenu';
import { usePopoverAnchor } from './use-popover-anchor';

export interface ReasoningTriggerProps {
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
}

export function ReasoningTrigger({ value, onChange }: ReasoningTriggerProps) {
  const popover = usePopoverAnchor();
  const effort = effectiveEffort(value);
  if (effort === null) {
    return null;
  }
  const label = AI_EFFORT_LABELS[effort];
  return (
    <>
      <span className="vsep" aria-hidden="true" />
      <button
        ref={popover.trigger}
        type="button"
        className={cx('ctl xs', popover.anchor !== null && 'on')}
        aria-haspopup="menu"
        aria-expanded={popover.anchor !== null}
        aria-label={`Reasoning: ${label}`}
        title={`Reasoning: ${label}`}
        onClick={popover.open}
      >
        <span className="lb">{label}</span>
        <span className="chev">
          <Icon name="down" size={12} />
        </span>
      </button>
      {popover.anchor === null ? null : (
        <ReasoningMenu
          anchor={popover.anchor}
          value={value}
          onChange={onChange}
          onClose={popover.close}
          onLeave={popover.dismiss}
        />
      )}
    </>
  );
}
