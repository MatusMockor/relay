import type { ServerSessions } from '../ai/remote/server-sessions';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';

export const createSessionHandlers = (sessions: ServerSessions): IpcInvokeHandlers => ({
  'session.getAccessToken': ({ serverUrl, rejected }) => {
    const session = sessions.get(serverUrl);
    return rejected === undefined ? session.access() : session.renew(rejected);
  },
  'session.setTokens': async ({ serverUrl, tokens }) => {
    await sessions.get(serverUrl).save(tokens);
    return { ok: true };
  },
  'session.clear': async ({ serverUrl }) => {
    await sessions.get(serverUrl).clear();
    return { ok: true };
  },
  'session.hasTokens': async ({ serverUrl }) => ({
    signedIn: await sessions.get(serverUrl).hasTokens(),
  }),
});
