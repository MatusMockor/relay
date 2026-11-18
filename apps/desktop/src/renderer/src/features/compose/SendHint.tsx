import { IS_MAC } from '../../lib/platform-keys';

export function SendHint() {
  return (
    <span className="btn-hint" aria-hidden="true">
      {IS_MAC ? '⌘ ↵' : 'Ctrl ↵'}
    </span>
  );
}
