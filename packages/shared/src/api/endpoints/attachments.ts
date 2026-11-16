import { z } from 'zod';
import { AttachmentIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const attachmentsEndpoints = {
  content: defineEndpoint({
    method: 'GET',
    path: '/attachments/:id/content',
    auth: 'user',
    params: idParamsOf(AttachmentIdSchema),
    response: z.unknown(),
  }),
};
