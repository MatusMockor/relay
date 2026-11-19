import type { HistoryDirection } from './navigation-history';

const SCROLLING = new Set(['auto', 'scroll']);

const isElement = (target: EventTarget): target is Element =>
  'scrollWidth' in target && 'ownerDocument' in target;

const canScroll = (element: Element): boolean => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style === undefined || style.overflowX === 'hidden' || style.overflowX === 'clip') {
    return false;
  }
  return SCROLLING.has(style.overflowX) || element === element.ownerDocument.scrollingElement;
};

const scrollsToward = (element: Element, direction: HistoryDirection): boolean => {
  if (element.scrollWidth <= element.clientWidth || !canScroll(element)) {
    return false;
  }
  if (direction === 'back') {
    return element.scrollLeft > 0;
  }
  return element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
};

export const scrollsHorizontally = (
  path: readonly EventTarget[],
  direction: HistoryDirection,
): boolean => path.some((target) => isElement(target) && scrollsToward(target, direction));
