import type { AnchorRect } from '@relay/ui';

export const rectOf = (element: Element): AnchorRect => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
};

export const centerRect = (): AnchorRect => {
  const x = window.innerWidth / 2;
  const y = window.innerHeight / 3;
  return { left: x - 145, right: x + 145, top: y, bottom: y };
};
