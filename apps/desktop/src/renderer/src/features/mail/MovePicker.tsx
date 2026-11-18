import { FolderIcon, Icon, Kbd, Overlay } from '@relay/ui';
import { useState } from 'react';
import { fuzzyScore } from '../../lib/text';
import { isControlTarget } from '../keyboard/focus-target';
import { Highlight } from '../list/Highlight';
import type { MoveTarget } from './move-targets';

export interface MovePickerProps {
  readonly targets: readonly MoveTarget[];
  readonly loading: boolean;
  readonly onPick: (target: MoveTarget) => void;
  readonly onClose: () => void;
}

const ICONS = { inbox: 'inbox', archive: 'check', folder: 'folder', label: 'label' } as const;

const matching = (targets: readonly MoveTarget[], query: string): MoveTarget[] => {
  if (query.trim() === '') {
    return [...targets];
  }
  return targets
    .map((target) => ({ target, score: fuzzyScore(query, target.label) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.target);
};

const emptyText = (targets: readonly MoveTarget[], loading: boolean, query: string) => {
  if (loading) {
    return 'Načítavam priečinky…';
  }
  return targets.length === 0 ? 'Žiadne priečinky' : `Nič pre „${query}“`;
};

export function MovePicker({ targets, loading, onPick, onClose }: MovePickerProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const shown = matching(targets, query);
  const pick = (target: MoveTarget | undefined) => {
    if (target === undefined) {
      return;
    }
    onClose();
    onPick(target);
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
      <div className="surface pal" role="dialog" aria-modal="true" aria-label="Presunúť do">
        <div className="pal-in">
          <Icon name="search" />
          <input
            autoFocus
            placeholder="Presunúť do priečinka alebo štítka…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Hľadať priečinok"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
          />
        </div>
        <div className="pal-body" role="listbox" aria-label="Priečinky">
          {shown.map((target, index) => (
            <button
              key={target.mailbox.id}
              type="button"
              role="option"
              aria-selected={index === cursor}
              className={`pi${index === cursor ? ' on' : ''}`}
              onMouseMove={() => {
                setCursor(index);
              }}
              onClick={() => {
                pick(target);
              }}
            >
              <span className="ic">
                <FolderIcon name={ICONS[target.kind]} />
              </span>
              <span className="lb">
                <Highlight text={target.label} query={query} />
              </span>
            </button>
          ))}
          {shown.length === 0 ? (
            <div className="pal-empty">{emptyText(targets, loading, query)}</div>
          ) : null}
        </div>
        <div className="pal-foot">
          <span>
            <Kbd keys={['↑', '↓']} /> vybrať
          </span>
          <span>
            <Kbd keys={['↵']} /> presunúť
          </span>
          <span>
            <Kbd keys={['Esc']} /> zavrieť
          </span>
        </div>
      </div>
    </Overlay>
  );
}
