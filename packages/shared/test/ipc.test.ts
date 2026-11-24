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
    expect(event.safeParse({ command: 'compose' }).success).toBe(true);
    expect(event.safeParse({ command: 'open-settings', section: 'notifications' }).success).toBe(
      true,
    );
    expect(event.safeParse({ command: 'open-settings', section: 'nowhere' }).success).toBe(false);
    expect(event.safeParse({ command: 'open-settings' }).success).toBe(false);
    expect(event.safeParse({ command: 'select-scope', scope: 'all' }).success).toBe(true);
    expect(event.safeParse({ command: 'select-scope', scope: 'acc_1' }).success).toBe(true);
    expect(event.safeParse({ command: 'select-scope', scope: '' }).success).toBe(false);
    expect(event.safeParse({ command: 'select-scope' }).success).toBe(false);
    expect(event.safeParse({ command: 'navigate-back' }).success).toBe(true);
    expect(event.safeParse({ command: 'navigate-forward' }).success).toBe(true);
    expect(event.safeParse({ command: 'quit' }).success).toBe(false);
  });

  it('accepts only a valid scope and account list as the tray report', () => {
    const { input, output } = ipcInvokeChannels['app.tray.report'];
    const account = {
      id: 'acc_1',
      displayName: 'Práca',
      email: 'jana@firma.sk',
      color: '#4f6ef7',
      status: 'connected',
      lastSyncedAt: '2026-11-18T09:30:00.000Z',
    };
    expect(input.safeParse({ session: null, scope: 'all', accounts: [] }).success).toBe(true);
    expect(input.safeParse({ scope: 'all', accounts: [] }).success).toBe(false);
    expect(input.safeParse({ session: 'a b', scope: 'all', accounts: [] }).success).toBe(false);
    expect(
      input.safeParse({ session: 'session-1', scope: 'acc_1', accounts: [account] }).success,
    ).toBe(true);
    expect(input.safeParse({ session: null, scope: '', accounts: [] }).success).toBe(false);
    expect(input.safeParse({ session: null, scope: 42, accounts: [] }).success).toBe(false);
    expect(input.safeParse({ scope: 'all' }).success).toBe(false);
    expect(
      input.safeParse({ session: null, scope: 'all', accounts: [{ ...account, color: 'red' }] })
        .success,
    ).toBe(false);
    expect(
      input.safeParse({
        session: null,
        scope: 'all',
        accounts: Array.from({ length: 101 }, () => account),
      }).success,
    ).toBe(false);
    expect(input.safeParse(undefined).success).toBe(false);
    expect(output.safeParse({ ok: true }).success).toBe(true);
  });

  it('accepts only bounded notifications from the renderer', () => {
    const { input } = ipcInvokeChannels['app.notification.show'];
    const valid = { title: 'Tibor', body: 'Ponuka', threadId: 'thr_1', session: 'session-1' };
    expect(input.safeParse(valid).success).toBe(true);
    expect(input.safeParse({ ...valid, body: '', threadId: null }).success).toBe(true);
    expect(input.safeParse({ ...valid, title: '' }).success).toBe(false);
    expect(input.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(false);
    expect(input.safeParse({ ...valid, body: 'x'.repeat(2_001) }).success).toBe(false);
    expect(input.safeParse({ ...valid, session: '' }).success).toBe(false);
    expect(input.safeParse({ title: 'Relay', body: '', threadId: null }).success).toBe(false);
  });

  it('accepts only boolean full screen statuses from the main process', () => {
    const { event } = ipcStreamChannels['app.window.fullScreen'];
    expect(event.safeParse({ fullScreen: true }).success).toBe(true);
    expect(event.safeParse({ fullScreen: 'yes' }).success).toBe(false);
    expect(event.safeParse({}).success).toBe(false);
  });

  it('accepts only bounded context menus with integer coordinates', () => {
    const { input, output } = ipcInvokeChannels['app.contextMenu.show'];
    const read = { type: 'item', id: 'read', label: 'Označiť ako prečítané', enabled: true };
    expect(input.safeParse({ items: [read, { type: 'separator' }], x: 10, y: 20 }).success).toBe(
      true,
    );
    expect(input.safeParse({ items: [], x: 10, y: 20 }).success).toBe(false);
    expect(input.safeParse({ items: [read], x: 10.5, y: 20 }).success).toBe(false);
    expect(input.safeParse({ items: [{ ...read, id: '' }], x: 0, y: 0 }).success).toBe(false);
    expect(
      input.safeParse({ items: [{ ...read, label: 'x'.repeat(121) }], x: 0, y: 0 }).success,
    ).toBe(false);
    expect(
      input.safeParse({ items: Array.from({ length: 31 }, () => read), x: 0, y: 0 }).success,
    ).toBe(false);
    expect(output.safeParse({ id: null }).success).toBe(true);
    expect(output.safeParse({ id: 'read' }).success).toBe(true);
  });

  it('makes input optional only for channels without input', () => {
    expectTypeOf<IpcInvokeArgs<'app.getInfo'>>().toEqualTypeOf<[]>();
    expectTypeOf<IpcInvokeArgs<'secure.get'>>().toEqualTypeOf<[input: { key: string }]>();
  });
});
