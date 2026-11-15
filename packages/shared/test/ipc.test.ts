import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type IpcInvokeArgs,
  ipcInvokeChannels,
  ipcStreamChannels,
  isIpcInvokeChannel,
  isIpcStreamChannel,
} from '../src/ipc';

describe('ipc channel map', () => {
  it('namespaces every channel', () => {
    const names = [...Object.keys(ipcInvokeChannels), ...Object.keys(ipcStreamChannels)];
    names.forEach((name) => {
      expect(name).toMatch(/^(app|settings|secure|ai|local)\.[a-zA-Z.]+$/);
    });
  });

  it('recognises known channels only', () => {
    expect(isIpcInvokeChannel('local.threads.list')).toBe(true);
    expect(isIpcInvokeChannel('toString')).toBe(false);
    expect(isIpcStreamChannel('ai.run')).toBe(true);
    expect(isIpcStreamChannel('local.threads.list')).toBe(false);
  });

  it('validates invoke inputs with the channel schema', () => {
    const { input } = ipcInvokeChannels['secure.set'];
    expect(input.safeParse({ key: 'server.token', value: 'x' }).success).toBe(true);
    expect(input.safeParse({ key: '../etc/passwd', value: 'x' }).success).toBe(false);
    expect(ipcInvokeChannels['app.getInfo'].input.safeParse(undefined).success).toBe(true);
  });

  it('makes input optional only for channels without input', () => {
    expectTypeOf<IpcInvokeArgs<'app.getInfo'>>().toEqualTypeOf<[]>();
    expectTypeOf<IpcInvokeArgs<'secure.get'>>().toEqualTypeOf<[input: { key: string }]>();
  });
});
