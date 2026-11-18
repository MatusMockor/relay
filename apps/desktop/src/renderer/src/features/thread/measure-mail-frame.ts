import { fitMailWidth } from './fit-mail-width';

const MIN_HEIGHT = 80;

const scrollbarOf = (document: Document): number =>
  Math.max(0, (document.defaultView?.innerHeight ?? 0) - document.documentElement.clientHeight);

const contentHeightOf = (frame: HTMLIFrameElement, document: Document): number => {
  const current = frame.style.height;
  frame.style.height = '0px';
  const height = document.documentElement.scrollHeight;
  frame.style.height = current;
  return height;
};

export const measureMailFrame = (frame: HTMLIFrameElement, document: Document): number => {
  fitMailWidth(document);
  const scrollbar = scrollbarOf(document);
  return Math.max(MIN_HEIGHT, contentHeightOf(frame, document) + scrollbar);
};
