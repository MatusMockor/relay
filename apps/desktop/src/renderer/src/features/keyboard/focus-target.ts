export const isControlTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('button, a[href]') !== null;
