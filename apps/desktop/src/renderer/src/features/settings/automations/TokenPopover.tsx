import { type AnchorRect, Popover } from '@relay/ui';
import { type ReactNode, useState } from 'react';

export interface TokenPopoverProps {
  readonly className: string;
  readonly label: string;
  readonly popoverLabel: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly width?: number;
  readonly onOpen?: () => void;
  readonly children: (close: () => void) => ReactNode;
}

export function TokenPopover({
  className,
  label,
  popoverLabel,
  content,
  disabled = false,
  width = 280,
  onOpen,
  children,
}: TokenPopoverProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const close = () => {
    setAnchor(null);
  };
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        disabled={disabled}
        onClick={(event) => {
          onOpen?.();
          setAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        {content}
      </button>
      {anchor === null ? null : (
        <Popover anchor={anchor} label={popoverLabel} className="aup" width={width} onClose={close}>
          {children(close)}
        </Popover>
      )}
    </>
  );
}
