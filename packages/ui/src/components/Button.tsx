import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { PopoverSide } from './Popover';
import { TooltipButton } from './tooltip/TooltipButton';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly children?: ReactNode;
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string | null>> = {
  default: null,
  primary: 'pri',
  ghost: 'ghost',
  danger: 'ghost danger',
};

export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={clsx('btn', VARIANT_CLASS[variant], className)} {...rest} />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly shortcut?: readonly string[];
  readonly side?: PopoverSide;
  readonly active?: boolean;
  readonly children?: ReactNode;
}

export function IconButton({ label, active = false, className, ...rest }: IconButtonProps) {
  return (
    <TooltipButton
      tip={label}
      aria-label={label}
      className={clsx('ibtn', active && 'on', className)}
      {...rest}
    />
  );
}
