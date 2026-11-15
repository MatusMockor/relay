import { clsx } from 'clsx';

export interface SwitchProps {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
}

export function Switch({ checked, label, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx('sw', checked && 'on')}
      onClick={() => {
        onChange(!checked);
      }}
    />
  );
}
