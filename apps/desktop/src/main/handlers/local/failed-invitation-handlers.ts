import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createFailedInvitationHandlers = (
  services: Pick<EngineServices, 'failedInvitations'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.calendar.failedInvitations.list': () => services.failedInvitations.list(userId),
  'local.calendar.failedInvitations.retry': (ref) => services.failedInvitations.retry(userId, ref),
  'local.calendar.failedInvitations.dismiss': async (ref) => {
    await services.failedInvitations.dismiss(userId, ref);
    return { ok: true };
  },
});
