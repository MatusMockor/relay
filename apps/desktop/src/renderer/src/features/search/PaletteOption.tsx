import type { MouseEvent, ReactNode } from 'react';

export interface PaletteOptionProps {
  readonly id: string;
  readonly active: boolean;
  readonly className: string;
  readonly onHover: () => void;
  readonly onPick: () => void;
  readonly children: ReactNode;
}

const keepInputFocus = (event: MouseEvent<HTMLDivElement>): void => {
  event.preventDefault();
};

export function PaletteOption({
  id,
  active,
  className,
  onHover,
  onPick,
  children,
}: PaletteOptionProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={active ? `${className} on` : className}
      onMouseMove={onHover}
      onMouseDown={keepInputFocus}
      onClick={onPick}
    >
      {children}
    </div>
  );
}
