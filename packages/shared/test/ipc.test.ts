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
      expect(name).toMatch(/^(app|settings|secure|session|ai|oauth|local)\.[a-zA-Z.]+$/);
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

  it('accepts only http server URLs for session channels', () => {
    const { input } = ipcInvokeChannels['session.getAccessToken'];
    expect(input.safeParse({ serverUrl: 'https://mail.example' }).success).toBe(true);
    expect(input.safeParse({ serverUrl: 'http://127.0.0.1:3000', rejected: 'jwt' }).success).toBe(
      true,
    );
    expect(input.safeParse({ serverUrl: 'file:///etc/passwd' }).success).toBe(false);
    expect(input.safeParse({ serverUrl: 'mail.example' }).success).toBe(false);
  });

  it('accepts only well-formed update statuses from the main process', () => {
    const { event } = ipcStreamChannels['app.update.events'];
    expect(event.safeParse({ kind: 'ready', version: '1.4.0' }).success).toBe(true);
    expect(
      event.safeParse({ kind: 'downloading', version: '1.4.0-beta.1', percent: 42 }).success,
    ).toBe(true);
    expect(event.safeParse({ kind: 'disabled', reason: 'manual-package' }).success).toBe(true);
    expect(event.safeParse({ kind: 'ready', version: '<img src=x>' }).success).toBe(false);
    expect(event.safeParse({ kind: 'downloading', version: '1.4.0', percent: 140 }).success).toBe(
      false,
    );
    expect(ipcInvokeChannels['app.update.install'].input.safeParse(undefined).success).toBe(true);
  });

  it('accepts the checking and up to date statuses only with a valid check time', () => {
    const { event } = ipcStreamChannels['app.update.events'];
    expect(event.safeParse({ kind: 'checking' }).success).toBe(true);
    expect(
      event.safeParse({ kind: 'current', checkedAt: '2026-11-18T09:30:00.000Z' }).success,
    ).toBe(true);
    expect(event.safeParse({ kind: 'current' }).success).toBe(false);
    expect(event.safeParse({ kind: 'current', checkedAt: 'yesterday' }).success).toBe(false);
    expect(ipcInvokeChannels['app.update.check'].input.safeParse(undefined).success).toBe(true);
    expect(ipcInvokeChannels['app.update.check'].output.safeParse({ ok: true }).success).toBe(true);
  });

  it('accepts only known menu commands for the renderer', () => {
    const { event } = ipcStreamChannels['app.menu.command'];
    expect(event.safeParse({ command: 'open-about' }).success).toBe(true);
    expect(event.safeParse({ command: 'quit' }).success).toBe(false);
  });

  it('makes input optional only for channels without input', () => {
    expectTypeOf<IpcInvokeArgs<'app.getInfo'>>().toEqualTypeOf<[]>();
    expectTypeOf<IpcInvokeArgs<'secure.get'>>().toEqualTypeOf<[input: { key: string }]>();
  });
});
