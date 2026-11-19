import {
  type FocusEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { AnchorRect } from '../Popover';

export const TOOLTIP_DELAY = 350;

export interface TooltipTriggerProps {
  readonly 'aria-describedby': string | undefined;
  readonly onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  readonly onMouseLeave: () => void;
  readonly onMouseDown: () => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: () => void;
}

export interface TooltipState {
  readonly id: string;
  readonly anchor: AnchorRect | null;
  readonly trigger: TooltipTriggerProps;
}

const rectOf = (element: HTMLElement): AnchorRect => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
};

const isFocusVisible = (element: HTMLElement): boolean => {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
};

const useDismissal = (open: boolean, hide: () => void) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      hide();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, [open, hide]);
};

export const useTooltip = (delay: number = TOOLTIP_DELAY): TooltipState => {
  const id = useId();
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current === null) {
      return;
    }
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback(() => {
    cancel();
    setAnchor(null);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  useDismissal(anchor !== null, hide);
  const trigger: TooltipTriggerProps = {
    'aria-describedby': anchor === null ? undefined : id,
    onMouseEnter: (event) => {
      const element = event.currentTarget;
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        setAnchor(rectOf(element));
      }, delay);
    },
    onMouseLeave: hide,
    onMouseDown: hide,
    onFocus: (event) => {
      if (!isFocusVisible(event.currentTarget)) {
        return;
      }
      cancel();
      setAnchor(rectOf(event.currentTarget));
    },
    onBlur: hide,
  };
  return { id, anchor, trigger };
};
