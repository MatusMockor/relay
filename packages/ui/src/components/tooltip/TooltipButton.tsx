import type { ButtonHTMLAttributes, FocusEvent, MouseEvent, ReactNode } from 'react';
import { Tooltip, type TooltipContent } from './Tooltip';
import { useTooltip } from './use-tooltip';

export interface TooltipButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<TooltipContent, 'label'> {
  readonly tip: ReactNode;
  readonly children?: ReactNode;
}

const chain =
  <E,>(first: ((event: E) => void) | undefined, second: (event: E) => void) =>
  (event: E) => {
    first?.(event);
    second(event);
  };

export function TooltipButton({
  tip,
  shortcut,
  side,
  type = 'button',
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onFocus,
  onBlur,
  children,
  ...rest
}: TooltipButtonProps) {
  const tooltip = useTooltip();
  const { trigger } = tooltip;
  return (
    <>
      <button
        type={type}
        {...rest}
        aria-describedby={trigger['aria-describedby']}
        onMouseEnter={chain<MouseEvent<HTMLButtonElement>>(onMouseEnter, trigger.onMouseEnter)}
        onMouseLeave={chain<MouseEvent<HTMLButtonElement>>(onMouseLeave, trigger.onMouseLeave)}
        onMouseDown={chain<MouseEvent<HTMLButtonElement>>(onMouseDown, trigger.onMouseDown)}
        onFocus={chain<FocusEvent<HTMLButtonElement>>(onFocus, trigger.onFocus)}
        onBlur={chain<FocusEvent<HTMLButtonElement>>(onBlur, trigger.onBlur)}
      >
        {children}
      </button>
      {tooltip.anchor === null ? null : (
        <Tooltip
          id={tooltip.id}
          anchor={tooltip.anchor}
          label={tip}
          shortcut={shortcut}
          side={side}
        />
      )}
    </>
  );
}
