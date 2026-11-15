import { NotFoundError } from '@relay/engine';
import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { IpcInvokeRouter } from '../src/main/ipc/invoke-router';

describe('IpcInvokeRouter', () => {
  const settings: DeviceSettings = DEFAULT_DEVICE_SETTINGS;

  it('passes parsed input to the handler and returns its validated output', async () => {
    const router = new IpcInvokeRouter({
      'settings.device.set': (patch) => ({ ...settings, mode: patch.mode ?? settings.mode }),
    });
    const result = await router.dispatch({
      channel: 'settings.device.set',
      input: { mode: 'local' },
    });
    expect(result).toEqual({ ok: true, data: { ...settings, mode: 'local' } });
  });

  it('rejects input that does not match the channel schema', async () => {
    const router = new IpcInvokeRouter({ 'secure.get': () => ({ value: null }) });
    const result = await router.dispatch({ channel: 'secure.get', input: { key: 'BAD KEY' } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation_failed');
    expect(!result.ok && result.error.issues?.[0]?.path).toBe('key');
  });

  it('rejects unknown channels and malformed envelopes', async () => {
    const router = new IpcInvokeRouter({});
    expect(await router.dispatch({ channel: 'constructor', input: null })).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'Unknown IPC channel "constructor"' },
    });
    expect(await router.dispatch('nope')).toEqual({
      ok: false,
      error: { code: 'validation_failed', message: 'Malformed IPC request' },
    });
  });

  it('maps engine errors to their api code and hides other errors', async () => {
    const router = new IpcInvokeRouter({
      'local.threads.get': ({ threadId }) => Promise.reject(new NotFoundError('Thread', threadId)),
      'local.settings.get': () => Promise.reject(new Error('disk on fire')),
    });
    expect(
      await router.dispatch({ channel: 'local.threads.get', input: { threadId: 't1' } }),
    ).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'Thread t1 was not found' },
    });
    expect(await router.dispatch({ channel: 'local.settings.get', input: undefined })).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Unexpected error in the main process' },
    });
  });

  it('refuses to return output that breaks the contract', async () => {
    const router = new IpcInvokeRouter({
      'secure.get': () => ({ value: 42 }) as unknown as { value: string },
    });
    const result = await router.dispatch({ channel: 'secure.get', input: { key: 'token' } });
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Handler for "secure.get" returned an invalid result' },
    });
  });
});
