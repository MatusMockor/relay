import type { AccountCredentials } from '@relay/shared/domain';
import type { FakeMailServer } from './fake-mail-server';

export const connectionFailure = (
  server: FakeMailServer,
  credentials: AccountCredentials,
): Error | null => {
  server.connections += 1;
  if (server.failConnect !== null) {
    return new Error(server.failConnect);
  }
  if (credentials.kind === 'password' && credentials.password !== server.password) {
    return new Error('Authentication failed');
  }
  return null;
};

export const takeConnectGate = (server: FakeMailServer): Promise<void> | null => {
  const gate = server.beforeNextConnect;
  if (gate === null) {
    return null;
  }
  server.beforeNextConnect = null;
  return gate();
};
