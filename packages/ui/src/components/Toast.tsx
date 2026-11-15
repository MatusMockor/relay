import { clsx } from 'clsx';
import { Kbd } from './Kbd';

export interface ToastProps {
  readonly message: string;
  readonly onUndo?: () => void;
}

export function Toast({ message, onUndo }: ToastProps) {
  return (
    <div
      className={clsx('toast', onUndo === undefined && 'plain')}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      {onUndo === undefined ? null : (
        <>
          <span className="dt">·</span>
          <button type="button" className="u" onClick={onUndo}>
            Späť <Kbd keys={['Z']} />
          </button>
        </>
      )}
    </div>
  );
}
