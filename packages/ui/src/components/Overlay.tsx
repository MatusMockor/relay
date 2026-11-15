import { clsx } from 'clsx';
import type { MouseEvent, ReactNode } from 'react';
import { useLayer } from './use-layer';

export type OverlayPlacement = 'top' | 'mid' | 'clear';

export interface OverlayProps {
  readonly placement?: OverlayPlacement;
  readonly onClose: () => void;
  readonly onKey?: (event: KeyboardEvent) => boolean;
  readonly children: ReactNode;
}

export function Overlay({ placement = 'top', onClose, onKey, children }: OverlayProps) {
  useLayer((event) => {
    if (onKey?.(event) === true) {
      return;
    }
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    onClose();
  };
  return (
    <div className={clsx('ov', placement !== 'top' && placement)} onMouseDown={onBackdrop}>
      {children}
    </div>
  );
}

export interface SheetProps extends Omit<OverlayProps, 'placement'> {
  readonly label: string;
  readonly className?: string;
  readonly role?: 'dialog' | 'alertdialog';
}

export function Sheet({ label, className, role = 'dialog', children, ...overlay }: SheetProps) {
  return (
    <Overlay placement="mid" {...overlay}>
      <div className={clsx('surface', className)} role={role} aria-modal="true" aria-label={label}>
        {children}
      </div>
    </Overlay>
  );
}
