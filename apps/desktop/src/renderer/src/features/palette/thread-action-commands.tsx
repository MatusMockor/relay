import type { ThreadSummary } from '@relay/shared';
import { FolderIcon } from '@relay/ui';
import { setUi } from '../../state/ui-store';
import type { ThreadCommands } from '../mail/use-thread-commands';
import { threadSpamCommand } from './thread-spam-command';
import type { Command } from './use-commands';

export const threadMoveCommand = (thread: ThreadSummary, ctx: string | undefined): Command => ({
  id: 'move',
  label: 'Presunúť do…',
  sub: ctx,
  keys: ['V'],
  icon: <FolderIcon name="folder" />,
  alias: 'presunut priecinok stitok folder label move',
  run: () => {
    setUi({ overlay: { kind: 'move', threadId: thread.id } });
  },
});

export const threadActionCommands = (
  thread: ThreadSummary,
  ctx: string | undefined,
  commands: ThreadCommands,
): Command[] => [threadMoveCommand(thread, ctx), ...threadSpamCommand(thread, ctx, commands)];
