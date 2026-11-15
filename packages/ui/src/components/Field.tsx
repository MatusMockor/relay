import type { InputHTMLAttributes } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function Field({ label, ...input }: FieldProps) {
  return (
    <label className="fld">
      <span>{label}</span>
      <input autoComplete="off" spellCheck={false} {...input} />
    </label>
  );
}
