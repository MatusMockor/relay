import { z } from 'zod';
import {
  FailedInvitationRefSchema,
  FailedInvitationRetrySchema,
  FailedInvitationSchema,
} from '../../domain/failed-invitation';
import { OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const failedInvitationEndpoints = {
  listFailedInvitations: defineEndpoint({
    method: 'GET',
    path: '/calendar/failed-invitations',
    auth: 'user',
    response: z.array(FailedInvitationSchema),
  }),
  retryFailedInvitation: defineEndpoint({
    method: 'POST',
    path: '/calendar/failed-invitations/:accountId/:messageId/retry',
    auth: 'user',
    params: FailedInvitationRefSchema,
    response: FailedInvitationRetrySchema,
  }),
  dismissFailedInvitation: defineEndpoint({
    method: 'DELETE',
    path: '/calendar/failed-invitations/:accountId/:messageId',
    auth: 'user',
    params: FailedInvitationRefSchema,
    response: OkResponseSchema,
  }),
};
