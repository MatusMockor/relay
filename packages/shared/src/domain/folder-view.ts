import { z } from 'zod';

export const FolderViewSchema = z.enum([
  'inbox',
  'tasks',
  'reminders',
  'done',
  'archive',
  'sent',
  'drafts',
  'scheduled',
  'trash',
  'spam',
  'mailbox',
  'label',
]);
export type FolderView = z.infer<typeof FolderViewSchema>;
