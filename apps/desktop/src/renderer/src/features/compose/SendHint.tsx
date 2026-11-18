import { Kbd } from '@relay/ui';
import { IS_MAC } from '../../lib/platform-keys';

export function SendHint() {
  return (
    <span className="send-hint" aria-hidden="true">
      <Kbd keys={IS_MAC ? ['⌘', '↵'] : ['Ctrl', '↵']} />
    </span>
  );
}
