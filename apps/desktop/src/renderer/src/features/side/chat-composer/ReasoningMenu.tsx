import { AI_EFFORT_LABELS, DEFAULT_AI_EFFORT } from '@relay/shared';
import { type AnchorRect, cx, Popover } from '@relay/ui';
import {
  choiceEfforts,
  effectiveEffort,
  type ModelChoice,
  withEffort,
} from '../../ai/model-choice/model-choice';
import { useMenuCursor } from './use-menu-cursor';

export interface ReasoningMenuProps {
  readonly anchor: AnchorRect;
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onClose: () => void;
  readonly onLeave: () => void;
}

export function ReasoningMenu({ anchor, value, onChange, onClose, onLeave }: ReasoningMenuProps) {
  const efforts = choiceEfforts(value);
  const selected = effectiveEffort(value);
  const pick = (index: number) => {
    const effort = efforts[index];
    if (effort === undefined) {
      return;
    }
    onClose();
    onChange(withEffort(value, effort));
  };
  const menu = useMenuCursor({
    count: efforts.length,
    initial: Math.max(
      0,
      efforts.findIndex((effort) => effort === selected),
    ),
    numbered: false,
    onPick: pick,
    onLeave,
  });
  return (
    <Popover
      anchor={anchor}
      side="above"
      role="menu"
      label="Reasoning"
      className="rsnm"
      width={200}
      onClose={onClose}
      onKey={menu.onKey}
    >
      <div ref={menu.body} tabIndex={-1} onBlur={menu.onBlur}>
        <div className="gl">Reasoning</div>
        {efforts.map((effort, index) => (
          <button
            key={effort}
            {...menu.item(index)}
            type="button"
            role="menuitemradio"
            aria-checked={effort === selected}
            className={cx('ri', index === menu.cursor && 'on')}
            onClick={() => {
              pick(index);
            }}
          >
            <span className="dot">{effort === selected ? <i /> : null}</span>
            <span className="lb">{AI_EFFORT_LABELS[effort]}</span>
            {effort === DEFAULT_AI_EFFORT ? <span className="k">predvolený</span> : null}
          </button>
        ))}
      </div>
    </Popover>
  );
}
