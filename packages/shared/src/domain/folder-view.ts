import { z } from 'zod';

export const FolderViewSchema = z.enum([
  'inbox',
  'tasks',
  'reminders',
  'done',
  'sent',
  'drafts',
  'scheduled',
  'trash',
  'spam',
]);
export type FolderView = z.infer<typeof FolderViewSchema>;
