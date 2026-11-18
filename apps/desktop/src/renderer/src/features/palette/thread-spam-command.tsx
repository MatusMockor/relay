import type { ThreadSummary } from '@relay/shared';
import { Icon } from '@relay/ui';
import { threadItem } from '../mail/list-items';
import type { ThreadCommands } from '../mail/use-thread-commands';
import type { Command } from './use-commands';

export const threadSpamCommand = (
  thread: ThreadSummary,
  ctx: string | undefined,
  commands: ThreadCommands,
): Command => {
  const inSpam = thread.state === 'spam';
  return {
    id: 'spam',
    label: inSpam ? 'Nie je spam' : 'Nahlásiť spam',
    sub: ctx,
    keys: ['!'],
    icon: <Icon name={inSpam ? 'inbox' : 'spam'} />,
    alias: 'spam junk nevyziadana posta nahlasit',
    run: () => {
      commands.toggleSpam(threadItem(thread));
    },
  };
};
