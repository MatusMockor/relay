import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { SecretStore } from '../secure/secret-store';

export const createSecureHandlers = (store: SecretStore): IpcInvokeHandlers => ({
  'secure.get': async ({ key }) => ({ value: await store.get(key) }),
  'secure.set': async ({ key, value }) => {
    await store.set(key, value);
    return { ok: true };
  },
  'secure.delete': async ({ key }) => {
    await store.delete(key);
    return { ok: true };
  },
});
