import type { AccountCredentials } from '@relay/shared/domain';
import type { FakeMailServer } from './fake-mail-server';

export const connectionFailure = (
  server: FakeMailServer,
  credentials: AccountCredentials,
): Error | null => {
  if (server.failConnect !== null) {
    return new Error(server.failConnect);
  }
  if (credentials.kind === 'password' && credentials.password !== server.password) {
    return new Error('Authentication failed');
  }
  return null;
};
