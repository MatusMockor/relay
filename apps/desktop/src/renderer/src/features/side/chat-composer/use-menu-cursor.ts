import { useEffect, useRef, useState } from 'react';
import { isControlTarget } from '../../keyboard/focus-target';

export interface MenuCursorOptions {
  readonly count: number;
  readonly initial: number;
  readonly numbered: boolean;
  readonly onPick: (index: number) => void;
}

export interface MenuItemProps {
  readonly 'data-menu-index': number;
  readonly tabIndex: 0 | -1;
  readonly onFocus: () => void;
  readonly onMouseMove: () => void;
}

const MOVES: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

const digitIndex = (key: string): number | null => (/^[1-9]$/.test(key) ? Number(key) - 1 : null);

const itemIndex = (target: EventTarget | null): number | null => {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const item = target.closest<HTMLElement>('[data-menu-index]');
  return item === null ? null : Number(item.dataset.menuIndex);
};

const focusIn = (root: HTMLElement | null, index: number): void => {
  const item = root?.querySelector<HTMLElement>(`[data-menu-index="${String(index)}"]`);
  (item ?? root)?.focus();
};

const consume = (event: KeyboardEvent): true => {
  event.preventDefault();
  event.stopPropagation();
  return true;
};

export const useMenuCursor = ({ count, initial, numbered, onPick }: MenuCursorOptions) => {
  const body = useRef<HTMLDivElement>(null);
  const start = useRef(initial);
  const [cursor, setCursor] = useState(initial);
  const moveTo = (index: number) => {
    setCursor(index);
    focusIn(body.current, index);
  };
  useEffect(() => {
    focusIn(body.current, start.current);
  }, []);
  const enterTarget = (target: EventTarget | null): number | null =>
    itemIndex(target) ?? (isControlTarget(target) ? null : cursor);
  const onKey = (event: KeyboardEvent): boolean => {
    const digit = numbered ? digitIndex(event.key) : null;
    if (digit !== null && digit < count) {
      onPick(digit);
      return consume(event);
    }
    const move = MOVES[event.key];
    if (move !== undefined && count > 0) {
      moveTo((cursor + move + count) % count);
      return consume(event);
    }
    const picked = event.key === 'Enter' ? enterTarget(event.target) : null;
    if (picked === null) {
      return false;
    }
    onPick(picked);
    return consume(event);
  };
  const item = (index: number): MenuItemProps => ({
    'data-menu-index': index,
    tabIndex: index === cursor ? 0 : -1,
    onFocus: () => {
      setCursor(index);
    },
    onMouseMove: () => {
      if (index !== cursor) {
        moveTo(index);
      }
    },
  });
  return { body, cursor, setCursor, onKey, item };
};
