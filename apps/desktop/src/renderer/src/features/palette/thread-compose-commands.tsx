import type { ThreadId } from '@relay/shared';
import { Icon } from '@relay/ui';
import type { ThreadComposeCommands } from '../mail/use-thread-compose';
import type { Command } from './use-commands';

export const threadComposeCommands = (
  threadId: ThreadId,
  ctx: string | undefined,
  compose: ThreadComposeCommands,
): Command[] => [
  {
    id: 'reply-all',
    label: 'Odpovedať všetkým',
    sub: ctx,
    keys: ['⇧', 'R'],
    icon: <Icon name="reply" />,
    alias: 'reply all odpovedat vsetkym',
    run: () => {
      compose.replyAll(threadId);
    },
  },
  {
    id: 'forward',
    label: 'Preposlať',
    sub: ctx,
    keys: ['F'],
    icon: <Icon name="forward" />,
    alias: 'forward preposlat poslat dalej',
    run: () => {
      compose.forward(threadId);
    },
  },
];
