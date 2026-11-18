import { IS_MAC } from '../../lib/platform-keys';

export function SendHint() {
  return (
    <span className="send-hint" aria-hidden="true">
      {IS_MAC ? '⌘ Enter' : 'Ctrl Enter'}
    </span>
  );
}
