import type { ContextMenuItem, ContextMenuRequest } from '@relay/shared';
import { Popover } from '@relay/ui';
import { useMemo, useState } from 'react';
import { isControlTarget } from '../keyboard/focus-target';
import { settleContextMenu, useContextMenuStore } from './context-menu-store';
import { isInsideMenu, useMenuFocus } from './use-menu-focus';

const MOVES: Readonly<Record<string, number>> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };

const isDisabledItem = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[aria-disabled="true"]') !== null;

const enabledIndexes = (items: readonly ContextMenuItem[]): number[] =>
  items.flatMap((item, index) => (item.type === 'item' && item.enabled ? [index] : []));

function ContextMenuPopover({ request }: { readonly request: ContextMenuRequest }) {
  const choosable = enabledIndexes(request.items);
  const [cursor, setCursor] = useState(0);
  const anchor = useMemo(
    () => ({ left: request.x, right: request.x, top: request.y, bottom: request.y }),
    [request],
  );
  const active = choosable[cursor] ?? null;
  const itemRef = useMenuFocus(active);
  const point = (index: number) => {
    if (choosable.includes(index)) {
      setCursor(choosable.indexOf(index));
    }
  };
  const choose = (index: number) => {
    const item = request.items[index];
    if (item?.type !== 'item' || !item.enabled) {
      return;
    }
    settleContextMenu(item.id);
  };
  const onKey = (event: KeyboardEvent) => {
    const move = MOVES[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setCursor((value) => (value + move + choosable.length) % Math.max(choosable.length, 1));
      return true;
    }
    if (event.key === 'Enter' && (isInsideMenu(event.target) || !isControlTarget(event.target))) {
      event.preventDefault();
      if (active !== null && !isDisabledItem(event.target)) {
        choose(active);
      }
      return true;
    }
    return false;
  };
  return (
    <Popover
      anchor={anchor}
      label="Kontextové menu"
      role="menu"
      width={220}
      onClose={() => {
        settleContextMenu(null);
      }}
      onKey={onKey}
    >
      {request.items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={index} className="sepl" />;
        }
        return (
          <button
            key={index}
            ref={itemRef(index)}
            type="button"
            role="menuitem"
            aria-disabled={item.enabled ? undefined : 'true'}
            tabIndex={item.enabled ? undefined : -1}
            className={`pi${index === active ? ' on' : ''}`}
            onMouseMove={() => {
              point(index);
            }}
            onFocus={() => {
              point(index);
            }}
            onClick={() => {
              choose(index);
            }}
          >
            <span className="lb">{item.label}</span>
          </button>
        );
      })}
    </Popover>
  );
}

export function ContextMenuHost() {
  const pending = useContextMenuStore((state) => state.pending);
  if (pending === null) {
    return null;
  }
  return <ContextMenuPopover key={pending.key} request={pending.request} />;
}
