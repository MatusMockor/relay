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

  it('validates the model and effort of a local AI run against the catalog', () => {
    const { input } = ipcStreamChannels['ai.run'];
    const question = { kind: 'chatAnswer', question: 'Čo dnes?', threadId: null, history: [] };
    const picked = input.safeParse({
      input: question,
      runner: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
    });
    expect(picked.data).toMatchObject({ runner: 'codex', model: 'gpt-6-astra', effort: 'high' });
    expect(
      input.safeParse({ input: question, runner: 'claude', model: null, effort: null }).success,
    ).toBe(true);
    expect(
      input.safeParse({ input: question, runner: 'claude', model: 'gpt-6-astra' }).success,
    ).toBe(false);
    expect(input.safeParse({ input: question, runner: 'codex', effort: 'max' }).success).toBe(
      false,
    );
    expect(input.safeParse({ input: question, effort: 'low' }).success).toBe(false);
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

  it('accepts only boolean full screen statuses from the main process', () => {
    const { event } = ipcStreamChannels['app.window.fullScreen'];
    expect(event.safeParse({ fullScreen: true }).success).toBe(true);
    expect(event.safeParse({ fullScreen: 'yes' }).success).toBe(false);
    expect(event.safeParse({}).success).toBe(false);
  });

  it('makes input optional only for channels without input', () => {
    expectTypeOf<IpcInvokeArgs<'app.getInfo'>>().toEqualTypeOf<[]>();
    expectTypeOf<IpcInvokeArgs<'secure.get'>>().toEqualTypeOf<[input: { key: string }]>();
  });
});
