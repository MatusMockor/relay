import { clsx } from 'clsx';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from '../Kbd';
import type { AnchorRect, PopoverSide } from '../Popover';
import { type TooltipPosition, tooltipPosition } from './tooltip-position';

export interface TooltipContent {
  readonly label: ReactNode;
  readonly shortcut?: readonly string[];
  readonly side?: PopoverSide;
}

export interface TooltipProps extends TooltipContent {
  readonly id: string;
  readonly anchor: AnchorRect;
}

const styleOf = (position: TooltipPosition | null): CSSProperties | undefined => {
  if (position === null) {
    return undefined;
  }
  return {
    left: position.left,
    top: position.top,
    ['--tip-arrow' as string]: `${String(position.arrow)}px`,
  };
};

export function Tooltip({ id, anchor, label, shortcut, side = 'below' }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    setPosition(
      tooltipPosition(
        anchor,
        side,
        { width: element.offsetWidth, height: element.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, side]);
  return createPortal(
    <span
      ref={ref}
      id={id}
      role="tooltip"
      className={clsx('tip', position === null ? 'measuring' : position.side)}
      style={styleOf(position)}
    >
      <span className="tip-label">{label}</span>{' '}
      {shortcut === undefined || shortcut.length === 0 ? null : (
        <span className="tip-keys">
          <Kbd keys={shortcut} />
        </span>
      )}
    </span>,
    document.body,
  );
}
