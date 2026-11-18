import { z } from 'zod';
import { AccountIdSchema, MailboxIdSchema } from '../../domain/ids';
import { MailboxSchema } from '../../domain/mailbox';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const FolderNameSchema = z.string().trim().min(1).max(200);

export const CreateFolderBodySchema = z.object({
  name: FolderNameSchema,
  parentId: MailboxIdSchema.nullable(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBodySchema>;

export const UpdateFolderBodySchema = z
  .object({
    name: FolderNameSchema.optional(),
    parentId: MailboxIdSchema.nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.parentId !== undefined, {
    message: 'Zadaj nový názov alebo nadradený priečinok.',
  });
export type UpdateFolderBody = z.infer<typeof UpdateFolderBodySchema>;

const accountIdParams = idParamsOf(AccountIdSchema);
const mailboxIdParams = idParamsOf(MailboxIdSchema);

export const foldersEndpoints = {
  create: defineEndpoint({
    method: 'POST',
    path: '/accounts/:id/mailboxes',
    auth: 'user',
    params: accountIdParams,
    body: CreateFolderBodySchema,
    response: MailboxSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/mailboxes/:id',
    auth: 'user',
    params: mailboxIdParams,
    body: UpdateFolderBodySchema,
    response: MailboxSchema,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/mailboxes/:id',
    auth: 'user',
    params: mailboxIdParams,
    response: OkResponseSchema,
  }),
};
