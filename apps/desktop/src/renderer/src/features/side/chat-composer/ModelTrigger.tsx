import { cx, Icon, ProviderLogo } from '@relay/ui';
import type { ModelChoice } from '../../ai/model-choice/model-choice';
import { RUNNER_LABELS, shortModelLabel } from '../../ai/model-choice/model-labels';
import { ModelMenu } from './ModelMenu';
import { usePopoverAnchor } from './use-popover-anchor';

export interface ModelTriggerProps {
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
}

export function ModelTrigger({ value, onChange }: ModelTriggerProps) {
  const popover = usePopoverAnchor();
  const provider = RUNNER_LABELS[value.runner];
  const label = shortModelLabel(value);
  return (
    <>
      <button
        ref={popover.trigger}
        type="button"
        className={cx('ctl', popover.anchor !== null && 'on')}
        aria-haspopup="dialog"
        aria-expanded={popover.anchor !== null}
        aria-label={`Model: ${provider}, ${label}`}
        title={`${label} (${provider})`}
        onClick={popover.open}
      >
        <ProviderLogo runner={value.runner} />
        <span className="lb">{label}</span>
        <span className="chev">
          <Icon name="down" size={12} />
        </span>
      </button>
      {popover.anchor === null ? null : (
        <ModelMenu
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
