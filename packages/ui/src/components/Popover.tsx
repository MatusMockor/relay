import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Overlay } from './Overlay';

export interface AnchorRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export type PopoverSide = 'below' | 'above';

export interface PopoverProps {
  readonly anchor: AnchorRect;
  readonly align?: 'left' | 'right';
  readonly side?: PopoverSide;
  readonly label: string;
  readonly role?: 'dialog' | 'menu' | 'listbox';
  readonly width?: number;
  readonly className?: string;
  readonly onClose: () => void;
  readonly onKey?: (event: KeyboardEvent) => boolean;
  readonly children: ReactNode;
}

const MARGIN = 8;
const GAP = 6;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const verticalPosition = (anchor: AnchorRect, side: PopoverSide, height: number): number => {
  const below = anchor.bottom + GAP;
  const above = anchor.top - height - GAP;
  const fitsBelow = below + height <= window.innerHeight - MARGIN;
  const fitsAbove = above >= MARGIN;
  const useAbove = side === 'above' ? fitsAbove || !fitsBelow : !fitsBelow;
  return useAbove ? Math.max(MARGIN, above) : below;
};

const placement = (
  anchor: AnchorRect,
  align: 'left' | 'right',
  side: PopoverSide,
  width: number,
  height: number,
) => {
  const preferred = align === 'right' ? anchor.right - width : anchor.left;
  const left = clamp(preferred, MARGIN, window.innerWidth - width - MARGIN);
  return { left, top: verticalPosition(anchor, side, height) };
};

export function Popover({
  anchor,
  align = 'left',
  side = 'below',
  label,
  role = 'dialog',
  width = 290,
  className,
  onClose,
  onKey,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + GAP });
  useLayoutEffect(() => {
    const element = ref.current;
    const place = () => {
      setPosition(placement(anchor, align, side, width, element?.offsetHeight ?? 0));
    };
    place();
    window.addEventListener('resize', place);
    if (element === null || typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', place);
      };
    }
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      window.removeEventListener('resize', place);
      observer.disconnect();
    };
  }, [anchor, align, side, width]);
  return (
    <Overlay placement="clear" onClose={onClose} onKey={onKey}>
      <div
        ref={ref}
        className={className === undefined ? 'pop' : `pop ${className}`}
        role={role}
        aria-label={label}
        style={{ left: position.left, top: position.top, width }}
      >
        {children}
      </div>
    </Overlay>
  );
}
