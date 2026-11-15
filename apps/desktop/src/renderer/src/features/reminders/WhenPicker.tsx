import { type AnchorRect, Popover } from '@relay/ui';
import { useEffect, useRef, useState } from 'react';
import { describeWhen } from '../../lib/dates';
import { parseWhen } from '../../lib/parse-when';
import { capitalize } from '../../lib/text';
import { isControlTarget } from '../keyboard/focus-target';
import type { WhenPreset } from './presets';

export interface WhenPickerProps {
  readonly anchor: AnchorRect;
  readonly title: string;
  readonly presets: readonly WhenPreset[];
  readonly now: Date;
  readonly onPick: (date: Date) => void;
  readonly onClose: () => void;
}

export function WhenPicker({ anchor, title, presets, now, onPick, onClose }: WhenPickerProps) {
  const [cursor, setCursor] = useState(0);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const parsed = parseWhen(text, now);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const pick = (date: Date | null | undefined) => {
    if (date === null || date === undefined) {
      return;
    }
    onClose();
    onPick(date);
  };
  const onKey = (event: KeyboardEvent) => {
    const typed = text.trim() !== '';
    if (!typed && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setCursor((value) =>
        Math.max(0, Math.min(presets.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1))),
      );
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      pick(typed ? parsed : presets[cursor]?.date);
      return true;
    }
    return false;
  };
  const preview =
    text.trim() === ''
      ? 'Alebo napíš vlastný čas'
      : parsed === null
        ? 'Nerozumiem. Skús „zajtra 9:00“ alebo „o 2 hodiny“.'
        : `→ ${capitalize(describeWhen(parsed, now).phrase)}`;
  return (
    <Popover anchor={anchor} align="right" label={title} onClose={onClose} onKey={onKey}>
      <div className="grp">{title}</div>
      {presets.map((preset, index) => (
        <button
          key={preset.label}
          type="button"
          className={`pi${text.trim() === '' && index === cursor ? ' on' : ''}`}
          onMouseMove={() => {
            setCursor(index);
          }}
          onClick={() => {
            pick(preset.date);
          }}
        >
          <span className="lb">{preset.label}</span>
          <span className="wh">{describeWhen(preset.date, now).wh}</span>
        </button>
      ))}
      <div className="pop-in">
        <input
          ref={input}
          placeholder="Napr. zajtra 9:00, o 2 hodiny, piatok"
          autoComplete="off"
          spellCheck={false}
          aria-label="Vlastný čas"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <span className={`pv${parsed === null ? '' : ' ok'}`} role="status">
          {preview}
        </span>
      </div>
    </Popover>
  );
}
