import type { Label, LabelId } from '@relay/shared';
import { Icon, Kbd, Overlay } from '@relay/ui';
import { useState } from 'react';
import { isControlTarget } from '../keyboard/focus-target';
import { type LabelOption, labelOptionsOf, optionKey } from './label-options';
import { LabelOptionRow } from './LabelOptionRow';
import type { LabelColorOf } from './use-label-color';

export interface LabelPickerProps {
  readonly labels: readonly Label[];
  readonly checked: ReadonlySet<LabelId>;
  readonly loading: boolean;
  readonly colorOf: LabelColorOf;
  readonly onToggle: (label: Label, on: boolean) => void;
  readonly onCreate: (name: string) => Promise<boolean>;
  readonly onClose: () => void;
}

const emptyText = (loading: boolean): string =>
  loading ? 'Načítavam štítky…' : 'Zatiaľ žiadne štítky, napíš názov nového';

export function LabelPicker({
  labels,
  checked,
  loading,
  colorOf,
  onToggle,
  onCreate,
  onClose,
}: LabelPickerProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const shown = labelOptionsOf(labels, query);
  const pick = (option: LabelOption | undefined) => {
    if (option === undefined || busy) {
      return;
    }
    if (option.kind === 'label') {
      onToggle(option.label, !checked.has(option.label.id));
      return;
    }
    setBusy(true);
    void onCreate(option.name)
      .then((created) => {
        if (!created) {
          return;
        }
        setQuery('');
        setCursor(0);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const onKey = (event: KeyboardEvent) => {
    const down = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n');
    const up = event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p');
    if (down || up) {
      event.preventDefault();
      setCursor((value) => Math.max(0, Math.min(shown.length - 1, value + (down ? 1 : -1))));
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      pick(shown[cursor]);
      return true;
    }
    return false;
  };
  return (
    <Overlay onClose={onClose} onKey={onKey}>
      <div className="surface pal" role="dialog" aria-modal="true" aria-label="Štítky">
        <div className="pal-in">
          <Icon name="search" />
          <input
            autoFocus
            placeholder="Hľadať alebo vytvoriť štítok…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Hľadať štítok"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
          />
        </div>
        <div className="pal-body" role="listbox" aria-label="Štítky konverzácie">
          {shown.map((option, index) => (
            <LabelOptionRow
              key={optionKey(option)}
              option={option}
              query={query}
              active={index === cursor}
              checked={option.kind === 'label' && checked.has(option.label.id)}
              color={option.kind === 'label' ? colorOf(option.label) : ''}
              onHover={() => {
                setCursor(index);
              }}
              onPick={() => {
                pick(option);
              }}
            />
          ))}
          {shown.length === 0 ? <div className="pal-empty">{emptyText(loading)}</div> : null}
        </div>
        <div className="pal-foot">
          <span>
            <Kbd keys={['↑', '↓']} /> vybrať
          </span>
          <span>
            <Kbd keys={['↵']} /> pridať alebo odobrať
          </span>
          <span>
            <Kbd keys={['Esc']} /> zavrieť
          </span>
        </div>
      </div>
    </Overlay>
  );
}
