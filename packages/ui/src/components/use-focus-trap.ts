import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusablesIn = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hidden);

const focusLeftDialog = (surface: HTMLElement | null): boolean => {
  const active = document.activeElement;
  return active === null || active === document.body || surface?.contains(active) === true;
};

export const useFocusTrap = (surfaceRef: RefObject<HTMLElement | null>): void => {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface !== null && !surface.contains(document.activeElement)) {
      surface.focus();
    }
    return () => {
      if (opener === null || !opener.isConnected || !focusLeftDialog(surface)) {
        return;
      }
      opener.focus();
    };
  }, [surfaceRef, opener]);
};

export const keepTabInside = (event: KeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'Tab') {
    return;
  }
  const items = focusablesIn(event.currentTarget);
  const first = items[0];
  const last = items.at(-1);
  const active = document.activeElement;
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};
