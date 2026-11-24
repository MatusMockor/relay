import { clsx } from 'clsx';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { focusWrapProps, keepTabInside, useFocusTrap } from './use-focus-trap';
import { LayerContext, useLayer } from './use-layer';

export type OverlayPlacement = 'top' | 'mid' | 'clear';

export interface OverlayProps {
  readonly placement?: OverlayPlacement;
  readonly onClose: () => void;
  readonly onKey?: (event: KeyboardEvent) => boolean;
  readonly children: ReactNode;
}

export function Overlay({ placement = 'top', onClose, onKey, children }: OverlayProps) {
  const layer = useLayer((event) => {
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
      <LayerContext value={layer}>{children}</LayerContext>
    </div>
  );
}

export interface SheetProps extends OverlayProps {
  readonly label: string;
  readonly className?: string;
  readonly role?: 'dialog' | 'alertdialog';
}

export function Sheet({
  label,
  className,
  role = 'dialog',
  placement = 'mid',
  children,
  ...overlay
}: SheetProps) {
  const surface = useRef<HTMLDivElement>(null);
  useFocusTrap(surface);
  return (
    <Overlay placement={placement} {...overlay}>
      <div
        ref={surface}
        className={clsx('surface', className)}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={keepTabInside}
      >
        {children}
        <span {...focusWrapProps} />
      </div>
    </Overlay>
  );
}
