import { clsx } from 'clsx';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';

export interface ResizeLimits {
  readonly min: number;
  readonly max: number;
  readonly initial: number;
  readonly cut: number;
}

export interface ResizeHandleProps {
  readonly edge: 'left' | 'right';
  readonly label: string;
  readonly controls: string;
  readonly width: number;
  readonly limits: ResizeLimits;
  readonly onResize: (width: number) => void;
  readonly onCollapse: () => void;
  readonly onCommit: () => void;
}

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  moved: boolean;
}

const STEP = 16;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const keyTarget = (
  key: string,
  edge: 'left' | 'right',
  width: number,
  limits: ResizeLimits,
): number | null => {
  const grow = edge === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const shrink = edge === 'left' ? 'ArrowLeft' : 'ArrowRight';
  const targets: Record<string, number> = {
    [grow]: width + STEP,
    [shrink]: width - STEP,
    Home: limits.min,
    End: limits.max,
    Enter: limits.initial,
  };
  return targets[key] ?? null;
};

export function ResizeHandle({
  edge,
  label,
  controls,
  width,
  limits,
  onResize,
  onCollapse,
  onCommit,
}: ResizeHandleProps) {
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      moved: false,
    };
    setActive(true);
    document.body.classList.add('rz-drag');
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - current.startX;
    current.moved = current.moved || Math.abs(dx) > 1;
    const raw = edge === 'left' ? current.startWidth + dx : current.startWidth - dx;
    if (raw < limits.cut) {
      onCollapse();
      return;
    }
    onResize(Math.round(clamp(raw, limits.min, limits.max)));
  };
  const onPointerEnd = () => {
    const current = drag.current;
    if (current === null) {
      return;
    }
    drag.current = null;
    setActive(false);
    document.body.classList.remove('rz-drag');
    if (current.moved) {
      onCommit();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    const target = keyTarget(event.key, edge, width, limits);
    if (target === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onResize(clamp(target, limits.min, limits.max));
    onCommit();
  };
  return (
    <div
      className={clsx('rz', active && 'on')}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={() => {
        onResize(limits.initial);
        onCommit();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
