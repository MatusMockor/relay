import { z } from 'zod';
import { LabelIdSchema, MailboxIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

export const ThreadActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('archive') }),
  z.object({ type: z.literal('undone') }),
  z.object({ type: z.literal('trash') }),
  z.object({ type: z.literal('restore') }),
  z.object({ type: z.literal('reportSpam') }),
  z.object({ type: z.literal('notSpam') }),
  z.object({ type: z.literal('markRead') }),
  z.object({ type: z.literal('markUnread') }),
  z.object({ type: z.literal('remind'), at: IsoDateTimeSchema }),
  z.object({ type: z.literal('cancelReminder') }),
  z.object({ type: z.literal('addLabel'), labelId: LabelIdSchema }),
  z.object({ type: z.literal('removeLabel'), labelId: LabelIdSchema }),
  z.object({ type: z.literal('move'), mailboxId: MailboxIdSchema }),
  z.object({ type: z.literal('undoMove') }),
]);
export type ThreadAction = z.infer<typeof ThreadActionSchema>;
export type ThreadActionType = ThreadAction['type'];
