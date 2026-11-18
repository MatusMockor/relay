import type { AnchorRect } from '@relay/ui';
import { type MouseEvent, useRef, useState } from 'react';

export const usePopoverAnchor = () => {
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const open = (event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget.getBoundingClientRect());
  };
  const dismiss = () => {
    setAnchor(null);
  };
  const close = () => {
    dismiss();
    trigger.current?.focus();
  };
  return { trigger, anchor, open, close, dismiss };
};
