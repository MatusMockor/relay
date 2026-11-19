import type { AnchorRect, PopoverSide } from '../Popover';

export interface TooltipSize {
  readonly width: number;
  readonly height: number;
}

export interface TooltipPosition {
  readonly left: number;
  readonly top: number;
  readonly side: PopoverSide;
  readonly arrow: number;
}

const MARGIN = 8;
const GAP = 8;
const ARROW_INSET = 10;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveSide = (
  anchor: AnchorRect,
  preferred: PopoverSide,
  height: number,
  viewport: TooltipSize,
): PopoverSide => {
  const fitsBelow = anchor.bottom + GAP + height <= viewport.height - MARGIN;
  const fitsAbove = anchor.top - GAP - height >= MARGIN;
  if (preferred === 'above') {
    return fitsAbove || !fitsBelow ? 'above' : 'below';
  }
  return fitsBelow || !fitsAbove ? 'below' : 'above';
};

export const tooltipPosition = (
  anchor: AnchorRect,
  preferred: PopoverSide,
  size: TooltipSize,
  viewport: TooltipSize,
): TooltipPosition => {
  const center = (anchor.left + anchor.right) / 2;
  const left = clamp(center - size.width / 2, MARGIN, viewport.width - size.width - MARGIN);
  const side = resolveSide(anchor, preferred, size.height, viewport);
  const top = side === 'below' ? anchor.bottom + GAP : anchor.top - GAP - size.height;
  const arrow = clamp(center - left, ARROW_INSET, Math.max(ARROW_INSET, size.width - ARROW_INSET));
  return { left, top: Math.max(MARGIN, top), side, arrow };
};
