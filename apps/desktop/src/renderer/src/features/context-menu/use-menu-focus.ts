import { useCallback, useEffect, useRef, useState } from 'react';

export const isInsideMenu = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="menu"]') !== null;

const focusWasLost = (): boolean => {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected || isInsideMenu(active);
};

export type MenuItemRef = (index: number) => (element: HTMLElement | null) => void;

export const useMenuFocus = (active: number | null): MenuItemRef => {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const items = useRef(new Map<number, HTMLElement>());
  useEffect(() => {
    if (active === null) {
      return;
    }
    items.current.get(active)?.focus();
  }, [active]);
  useEffect(
    () => () => {
      if (opener === null || !opener.isConnected || !focusWasLost()) {
        return;
      }
      opener.focus();
    },
    [opener],
  );
  return useCallback(
    (index) => (element) => {
      if (element === null) {
        items.current.delete(index);
        return;
      }
      items.current.set(index, element);
    },
    [],
  );
};
