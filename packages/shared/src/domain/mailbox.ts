import { z } from 'zod';
import { AccountIdSchema, MailboxIdSchema } from './ids';

export const MailboxRoleSchema = z.enum([
  'inbox',
  'sent',
  'drafts',
  'trash',
  'archive',
  'spam',
  'custom',
  'label',
  'system',
]);
export type MailboxRole = z.infer<typeof MailboxRoleSchema>;

export const MailboxSchema = z.object({
  id: MailboxIdSchema,
  accountId: AccountIdSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  delimiter: z.string().nullable(),
  role: MailboxRoleSchema,
  subscribed: z.boolean(),
  uidValidity: z.number().int().nonnegative().nullable(),
  unreadCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});
export type Mailbox = z.infer<typeof MailboxSchema>;
