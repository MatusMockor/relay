import type { HistoryDirection } from './navigation-history';

export type ScrollRoom = Readonly<Record<HistoryDirection, boolean>>;

const NO_ROOM: ScrollRoom = { back: false, forward: false };
const SCROLLING = new Set(['auto', 'scroll']);

const isElement = (target: EventTarget): target is Element =>
  'scrollWidth' in target && 'ownerDocument' in target;

const scrollStyle = (element: Element): CSSStyleDeclaration | null => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  if (style === null || style.overflowX === 'hidden' || style.overflowX === 'clip') {
    return null;
  }
  if (SCROLLING.has(style.overflowX) || element === element.ownerDocument.scrollingElement) {
    return style;
  }
  return null;
};

const roomOf = (element: Element): ScrollRoom => {
  const range = element.scrollWidth - element.clientWidth;
  const style = range > 0 ? scrollStyle(element) : null;
  if (style === null) {
    return NO_ROOM;
  }
  const start = style.direction === 'rtl' ? -range : 0;
  return {
    back: element.scrollLeft > start,
    forward: element.scrollLeft < start + range - 1,
  };
};

export const scrollRoom = (path: readonly EventTarget[]): ScrollRoom =>
  path.filter(isElement).reduce<ScrollRoom>((room, element) => {
    const own = roomOf(element);
    return { back: room.back || own.back, forward: room.forward || own.forward };
  }, NO_ROOM);
