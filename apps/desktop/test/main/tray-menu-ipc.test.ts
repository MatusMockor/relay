import { AccountIdSchema } from '@relay/shared/domain';
import type { MenuCommand } from '@relay/shared/ipc';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import { NotificationPause } from '../../src/main/native/notification-pause';
import { RendererView } from '../../src/main/native/renderer-view';
import { createTrayActionHandler } from '../../src/main/native/tray-actions';
import { TrayMenu } from '../../src/main/native/tray-menu';
import { trayMenuFeaturesOf } from '../../src/main/native/tray-menu-features';
import { buildTrayTemplate } from '../../src/main/native/tray-menu-template';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';
import { accountOverview, reportedAccount } from './support/account-overviews';
import { ManualTime } from './support/manual-time';

const appMetadata = {
  name: 'Relay',
  version: '0.1.5',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

const SESSION = 'session-1';

const work = accountOverview({ unread: 3 });
const home = accountOverview({
  id: AccountIdSchema.parse('acc_home'),
  displayName: 'Domov',
  email: 'jana@gmail.com',
  unread: 1,
});

let streams = 0;

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const setup = () => {
  const time = new ManualTime('2026-11-15T08:00:00.000Z');
  const view = new RendererView();
  const pause = new NotificationPause(time, time);
  const menuCommands = new MenuCommandRequests();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, menuCommands, rendererView: view })),
    () => {
      streams += 1;
      return `tray-${String(streams)}`;
    },
  );
  const menu = new TrayMenu({ appName: 'Relay', clock: time, view, pause });
  const effects: string[] = [];
  const dispatch = createTrayActionHandler({
    showWindow: () => effects.push('show'),
    requestCommand: (command) => {
      menuCommands.request(command);
    },
    syncNow: () => effects.push('sync'),
    pause,
    checkForUpdates: () => effects.push('check'),
    quit: () => effects.push('quit'),
  });
  const template = () =>
    buildTrayTemplate(menu.items(), {
      features: trayMenuFeaturesOf('darwin', '15.1.0'),
      icons: { dot: () => undefined },
      dispatch,
    });
  let changes = 0;
  menu.changes.subscribe(() => {
    changes += 1;
  });
  view.update({
    session: SESSION,
    scope: 'all',
    accounts: [reportedAccount(work), reportedAccount(home)],
  });
  menu.show([work, home]);
  return {
    time,
    view,
    pause,
    bridge,
    menu,
    template,
    effects,
    menuCommands,
    changes: () => changes,
  };
};

const find = (
  items: readonly MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined =>
  items
    .flatMap((item) => [item, ...(Array.isArray(item.submenu) ? item.submenu : [])])
    .find((item) => item.label === label);

const press = (item: MenuItemConstructorOptions | undefined): void => {
  expect(item?.click).toBeTypeOf('function');
  if (item?.click === undefined) {
    return;
  }
  Reflect.apply(item.click, undefined, []);
};

const checkedLabels = (items: readonly MenuItemConstructorOptions[]) =>
  items.filter((item) => item.type === 'radio' && item.checked === true).map((item) => item.label);

const receiveCommands = async (
  bridge: ReturnType<typeof setup>['bridge'],
  act: () => void,
): Promise<MenuCommand[]> => {
  const received: MenuCommand[] = [];
  const unsubscribe = bridge.subscribe('app.menu.command', {
    onEvent: (event) => {
      received.push(event);
    },
  });
  await settle();
  act();
  await settle();
  unsubscribe();
  return received;
};

describe('tray menu over IPC', () => {
  it('checks the account the renderer reports as its scope', async () => {
    const { bridge, template, changes } = setup();
    expect(checkedLabels(template())).toEqual(['Všetky účty']);
    const accounts = [reportedAccount(work), reportedAccount(home)];

    expect(
      await bridge.invoke('app.tray.report', { session: SESSION, scope: home.id, accounts }),
    ).toEqual({
      ok: true,
      data: { ok: true },
    });

    expect(checkedLabels(template())).toEqual(['Domov']);
    expect(changes()).toBe(3);
    await bridge.invoke('app.tray.report', { session: SESSION, scope: home.id, accounts });
    expect(changes()).toBe(3);
  });

  it('lists the accounts the renderer shows and fills in local unread counts', async () => {
    const { bridge, template } = setup();
    const server = accountOverview({
      id: AccountIdSchema.parse('acc_server'),
      displayName: 'Server',
      email: 'jana@server.sk',
      status: 'syncing',
    });
    await bridge.invoke('app.tray.report', {
      session: SESSION,
      scope: 'all',
      accounts: [reportedAccount(work), reportedAccount(server)],
    });
    const radios = template().filter((item) => item.type === 'radio');
    expect(radios.map((item) => [item.label, item.sublabel])).toEqual([
      ['Všetky účty', undefined],
      ['Práca', 'jana@firma.sk - 3'],
      ['Server', 'jana@server.sk'],
    ]);
    expect(find(template(), 'Domov')).toBeUndefined();
    expect(template()[0]?.label).toBe('Synchronizuje sa…');
  });

  it('hides the account picker when the renderer reports no accounts', async () => {
    const { bridge, template } = setup();
    await bridge.invoke('app.tray.report', { session: SESSION, scope: 'all', accounts: [] });
    expect(find(template(), 'Otvoriť s účtom')).toBeUndefined();
    expect(template()[0]?.label).toBe('Žiadny pripojený účet');
  });

  it('rejects a malformed tray report and keeps the current view', async () => {
    const { bridge, view } = setup();
    const result = await bridge.invoke('app.tray.report', {
      session: SESSION,
      scope: '../etc',
      accounts: [],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    expect(view.scope()).toBe('all');
    expect(view.accounts()).toHaveLength(2);
  });

  it('delivers commands asked for before the renderer listens in order', async () => {
    const { bridge, template } = setup();
    press(find(template(), 'Domov'));
    press(find(template(), 'Nová správa'));
    const received = await receiveCommands(bridge, () => undefined);
    expect(received).toEqual([{ command: 'select-scope', scope: home.id }, { command: 'compose' }]);
  });

  it('keeps only the ten most recent commands while nobody listens', async () => {
    const { bridge, menuCommands } = setup();
    menuCommands.request({ command: 'open-about' });
    menuCommands.request({ command: 'open-about' });
    Array.from({ length: 10 }).forEach(() => {
      menuCommands.request({ command: 'compose' });
    });
    const received = await receiveCommands(bridge, () => undefined);
    expect(received).toEqual(Array.from({ length: 10 }, () => ({ command: 'compose' })));
  });

  it('asks the renderer to switch the scope, compose and open settings and about', async () => {
    const { bridge, template, effects } = setup();
    const received = await receiveCommands(bridge, () => {
      press(find(template(), 'Domov'));
    });
    const more = await receiveCommands(bridge, () => {
      press(find(template(), 'Nová správa'));
      press(find(template(), 'Nastavenia…'));
      press(find(template(), 'Nastavenia notifikácií…'));
      press(find(template(), 'O aplikácii Relay'));
    });

    expect([...received, ...more]).toEqual([
      { command: 'select-scope', scope: home.id },
      { command: 'compose' },
      { command: 'open-settings', section: 'accounts' },
      { command: 'open-settings', section: 'notifications' },
      { command: 'open-about' },
    ]);
    expect(effects).toEqual(['show', 'show', 'show', 'show', 'show']);
  });

  it('runs the main process actions without bothering the renderer', async () => {
    const { bridge, template, effects } = setup();
    const received = await receiveCommands(bridge, () => {
      press(find(template(), 'Otvoriť Relay'));
      press(find(template(), 'Synchronizovať teraz'));
      press(find(template(), 'Skontrolovať aktualizácie…'));
      press(find(template(), 'Ukončiť Relay'));
    });
    expect(received).toEqual([]);
    expect(effects).toEqual(['show', 'sync', 'check', 'quit']);
  });

  it('pauses notifications from the menu and offers to resume them', () => {
    const { template, pause, time, changes } = setup();
    press(find(template(), 'Na 1 hodinu'));
    expect(pause.isPaused()).toBe(true);
    const paused = new Date(time.now().getTime() + 60 * 60_000);
    const pausedLabel = `Notifikácie pozastavené do ${String(paused.getHours())}:${String(
      paused.getMinutes(),
    ).padStart(2, '0')}`;
    expect(find(template(), pausedLabel)).toMatchObject({ enabled: false });

    press(find(template(), 'Obnoviť notifikácie'));

    expect(pause.isPaused()).toBe(false);
    expect(find(template(), 'Obnoviť notifikácie')).toBeUndefined();
    expect(changes()).toBe(4);
  });

  it('refreshes the sync age every time the menu is built', async () => {
    const { template, time } = setup();
    expect(template()[0]?.label).toBe('Synchronizované pred 2 min');
    await time.advance(5 * 60_000);
    expect(template()[0]?.label).toBe('Synchronizované pred 7 min');
  });
});
