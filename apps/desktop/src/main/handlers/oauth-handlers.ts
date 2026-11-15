import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { GoogleOAuthCoordinator } from '../oauth/google-oauth-coordinator';

export const createOAuthHandlers = (coordinator: GoogleOAuthCoordinator): IpcInvokeHandlers => ({
  'oauth.google.authorize': (input) => coordinator.authorize(input),
  'oauth.google.cancel': () => {
    coordinator.cancel();
    return { ok: true };
  },
});
