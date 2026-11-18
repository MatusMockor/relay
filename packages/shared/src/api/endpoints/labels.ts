import { z } from 'zod';
import { AccountIdSchema, LabelIdSchema } from '../../domain/ids';
import { LabelSchema } from '../../domain/label';
import { HexColorSchema } from '../../domain/primitives';
import { OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const LABEL_DISPLAY_NAME_MAX_LENGTH = 100;

export const LabelListQuerySchema = z.object({ accountId: AccountIdSchema.optional() });
export type LabelListQuery = z.infer<typeof LabelListQuerySchema>;

const LabelNameSchema = z.string().trim().min(1).max(LABEL_DISPLAY_NAME_MAX_LENGTH);

export const CreateLabelBodySchema = z.object({
  accountId: AccountIdSchema,
  name: LabelNameSchema,
  color: HexColorSchema.nullable().optional(),
});
export type CreateLabelBody = z.infer<typeof CreateLabelBodySchema>;

export const UpdateLabelBodySchema = z
  .object({
    name: LabelNameSchema.optional(),
    color: HexColorSchema.nullable().optional(),
  })
  .refine((patch) => patch.name !== undefined || patch.color !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateLabelBody = z.infer<typeof UpdateLabelBodySchema>;

const labelIdParams = z.object({ id: LabelIdSchema });

export const labelsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/labels',
    auth: 'user',
    query: LabelListQuerySchema,
    response: z.array(LabelSchema),
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/labels',
    auth: 'user',
    body: CreateLabelBodySchema,
    response: LabelSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/labels/:id',
    auth: 'user',
    params: labelIdParams,
    body: UpdateLabelBodySchema,
    response: LabelSchema,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/labels/:id',
    auth: 'user',
    params: labelIdParams,
    response: OkResponseSchema,
  }),
};
