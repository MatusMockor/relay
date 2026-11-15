import { clsx } from 'clsx';

export type StatusTone = 'ok' | 'off' | 'busy' | 'bad';

export function Status({ tone, label }: { readonly tone: StatusTone; readonly label: string }) {
  return (
    <span className={clsx('stat', tone !== 'ok' && tone)}>
      <i />
      {label}
    </span>
  );
}
