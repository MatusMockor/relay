import { Icon } from '@relay/ui';
import { Highlight } from '../list/Highlight';
import type { LabelOption } from './label-options';

export interface LabelOptionRowProps {
  readonly option: LabelOption;
  readonly query: string;
  readonly active: boolean;
  readonly checked: boolean;
  readonly color: string;
  readonly onHover: () => void;
  readonly onPick: () => void;
}

export function LabelOptionRow({
  option,
  query,
  active,
  checked,
  color,
  onHover,
  onPick,
}: LabelOptionRowProps) {
  const create = option.kind === 'create';
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-checked={create ? undefined : checked}
      className={`pi lbl-opt${active ? ' on' : ''}`}
      onMouseMove={onHover}
      onClick={onPick}
    >
      <span className="ic">
        {create ? (
          <Icon name="plus" />
        ) : (
          <span className={`lbl-ck${checked ? ' on' : ''}`} style={{ ['--d' as string]: color }}>
            {checked ? <Icon name="check" size={11} strokeWidth={2.2} /> : null}
          </span>
        )}
      </span>
      <span className="lb">
        {create ? (
          `Vytvoriť štítok „${option.name}“`
        ) : (
          <Highlight text={option.label.name} query={query} />
        )}
      </span>
    </button>
  );
}
