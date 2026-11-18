import { AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { AccountOverview } from '../../src/main/native/account-overview';
import type { TrayMenuItem } from '../../src/main/native/tray-menu-items';
import { buildTrayMenu, type TrayMenuSnapshot } from '../../src/main/native/tray-menu-model';
import { accountOverview } from './support/account-overviews';

const NOW = new Date('2026-11-15T08:00:00.000Z');

const work = accountOverview({ unread: 3 });
const home = accountOverview({
  id: AccountIdSchema.parse('acc_home'),
  displayName: 'Domov',
  email: 'jana@gmail.com',
  color: '#ef6b6b',
  unread: 2,
});

const snapshot = (overrides: Partial<TrayMenuSnapshot> = {}): TrayMenuSnapshot => ({
  appName: 'Relay',
  accounts: [work, home],
  scope: 'all',
  pause: { kind: 'active' },
  now: NOW,
  ...overrides,
});

const labelOf = (item: TrayMenuItem): string => {
  if (item.kind === 'separator') {
    return '---';
  }
  return item.label;
};

const choices = (items: readonly TrayMenuItem[]) =>
  items.flatMap((item) =>
    item.kind === 'choice'
      ? [{ label: item.label, sublabel: item.sublabel, checked: item.checked }]
      : [],
  );

const statusOf = (accounts: readonly AccountOverview[], now = NOW) => {
  const [first] = buildTrayMenu(snapshot({ accounts, now }));
  return first;
};

describe('buildTrayMenu', () => {
  it('lays the menu out like Docker Desktop with every section in order', () => {
    expect(buildTrayMenu(snapshot()).map(labelOf)).toEqual([
      'Synchronizované pred 2 min',
      '---',
      'Otvoriť Relay',
      'Nová správa',
      '---',
      'Otvoriť s účtom',
      'Práca',
      'Domov',
      'Všetky účty',
      '---',
      'Synchronizovať teraz',
      'Pozastaviť notifikácie',
      '---',
      'Nastavenia…',
      'Skontrolovať aktualizácie…',
      'O aplikácii Relay',
      '---',
      'Ukončiť Relay',
    ]);
  });

  it('lists every account with its unread count and checks the active scope', () => {
    expect(choices(buildTrayMenu(snapshot()))).toEqual([
      { label: 'Práca', sublabel: 'jana@firma.sk - 3', checked: false },
      { label: 'Domov', sublabel: 'jana@gmail.com - 2', checked: false },
      { label: 'Všetky účty', sublabel: '5 neprečítaných', checked: true },
    ]);
    expect(
      choices(buildTrayMenu(snapshot({ scope: home.id }))).map((item) => item.checked),
    ).toEqual([false, true, false]);
  });

  it('leaves out unread counts it does not know', () => {
    const remote = { ...home, unread: null };
    expect(choices(buildTrayMenu(snapshot({ accounts: [work, remote] })))).toEqual([
      { label: 'Práca', sublabel: 'jana@firma.sk - 3', checked: false },
      { label: 'Domov', sublabel: 'jana@gmail.com', checked: false },
      { label: 'Všetky účty', sublabel: null, checked: true },
    ]);
  });

  it('falls back to all accounts when the active scope points at a removed account', () => {
    const items = buildTrayMenu(snapshot({ scope: AccountIdSchema.parse('acc_gone') }));
    expect(choices(items).map((item) => item.checked)).toEqual([false, false, true]);
  });

  it('shows a single account checked without the all accounts row', () => {
    expect(choices(buildTrayMenu(snapshot({ accounts: [work], scope: 'all' })))).toEqual([
      { label: 'Práca', sublabel: 'jana@firma.sk - 3', checked: true },
    ]);
  });

  it('hides the account section when there is no account', () => {
    const labels = buildTrayMenu(snapshot({ accounts: [] })).map(labelOf);
    expect(labels).not.toContain('Otvoriť s účtom');
    expect(labels.slice(0, 6)).toEqual([
      'Žiadny pripojený účet',
      '---',
      'Otvoriť Relay',
      'Nová správa',
      '---',
      'Synchronizovať teraz',
    ]);
  });

  it('picks the scope action of the chosen account', () => {
    const item = buildTrayMenu(snapshot()).find(
      (entry) => entry.kind === 'choice' && entry.label === 'Domov',
    );
    expect(item?.kind === 'choice' ? item.action : null).toEqual({
      type: 'select-scope',
      scope: home.id,
    });
  });

  it('describes the sync state from the account statuses', () => {
    expect(statusOf([work])).toEqual({
      kind: 'status',
      label: 'Synchronizované pred 2 min',
      tone: 'ok',
    });
    expect(statusOf([accountOverview({ lastSyncedAt: '2026-11-15T07:59:30.000Z' })])).toEqual({
      kind: 'status',
      label: 'Synchronizované práve teraz',
      tone: 'ok',
    });
    expect(statusOf([accountOverview({ lastSyncedAt: '2026-11-15T05:00:00.000Z' })])).toEqual({
      kind: 'status',
      label: 'Synchronizované pred 3 h',
      tone: 'ok',
    });
    expect(statusOf([accountOverview({ lastSyncedAt: '2026-11-13T07:00:00.000Z' })])).toEqual({
      kind: 'status',
      label: 'Synchronizované pred 2 d',
      tone: 'ok',
    });
    expect(statusOf([work, accountOverview({ status: 'syncing' })])).toEqual({
      kind: 'status',
      label: 'Synchronizuje sa…',
      tone: 'busy',
    });
    expect(
      statusOf([accountOverview({ status: 'syncing' }), accountOverview({ status: 'error' })]),
    ).toEqual({ kind: 'status', label: 'Synchronizácia zlyhala', tone: 'failed' });
    expect(statusOf([accountOverview({ lastSyncedAt: null })])).toEqual({
      kind: 'status',
      label: 'Čaká na prvú synchronizáciu',
      tone: 'idle',
    });
  });

  it('uses the most recent successful sync across accounts', () => {
    const older = accountOverview({ lastSyncedAt: '2026-11-15T07:00:00.000Z' });
    const newer = accountOverview({ lastSyncedAt: '2026-11-15T07:55:00.000Z' });
    expect(statusOf([older, newer])).toMatchObject({ label: 'Synchronizované pred 5 min' });
  });

  it('refreshes the relative time from the snapshot clock', () => {
    const later = new Date(NOW.getTime() + 10 * 60_000);
    expect(statusOf([work], later)).toMatchObject({ label: 'Synchronizované pred 12 min' });
  });

  it('offers the pause options and the notification settings', () => {
    const submenu = buildTrayMenu(snapshot()).find((item) => item.kind === 'submenu');
    expect(submenu?.kind === 'submenu' ? submenu.items : []).toEqual([
      {
        kind: 'action',
        label: 'Na 1 hodinu',
        action: { type: 'pause-notifications', duration: 'hour' },
      },
      {
        kind: 'action',
        label: 'Do zajtra rána',
        action: { type: 'pause-notifications', duration: 'morning' },
      },
      {
        kind: 'action',
        label: 'Kým ich nezapnem',
        action: { type: 'pause-notifications', duration: 'indefinite' },
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Nastavenia notifikácií…',
        action: { type: 'open-settings', section: 'notifications' },
      },
    ]);
  });

  it('shows until when notifications are paused and how to resume them', () => {
    const now = new Date(2026, 10, 15, 14, 30);
    const labels = (until: Date | null) =>
      buildTrayMenu(snapshot({ now, pause: { kind: 'paused', until } }))
        .map(labelOf)
        .slice(10, 13);
    expect(labels(new Date(2026, 10, 15, 15, 30))).toEqual([
      'Synchronizovať teraz',
      'Notifikácie pozastavené do 15:30',
      'Obnoviť notifikácie',
    ]);
    expect(labels(new Date(2026, 10, 16, 8, 0))).toEqual([
      'Synchronizovať teraz',
      'Notifikácie pozastavené do zajtra 8:00',
      'Obnoviť notifikácie',
    ]);
    expect(labels(new Date(2026, 10, 20, 9, 5))).toEqual([
      'Synchronizovať teraz',
      'Notifikácie pozastavené do 20. 11. 9:05',
      'Obnoviť notifikácie',
    ]);
    expect(labels(null)).toEqual([
      'Synchronizovať teraz',
      'Notifikácie pozastavené',
      'Obnoviť notifikácie',
    ]);
  });

  it('shows the settings and quit shortcuts without account shortcuts', () => {
    const items = buildTrayMenu(snapshot());
    const accelerators = items.flatMap((item) =>
      item.kind === 'action' && item.accelerator !== undefined
        ? [[item.label, item.accelerator]]
        : [],
    );
    expect(accelerators).toEqual([
      ['Nastavenia…', 'CmdOrCtrl+,'],
      ['Ukončiť Relay', 'CmdOrCtrl+Q'],
    ]);
  });

  it('pluralises the unread total in Slovak', () => {
    const total = (unread: number) =>
      choices(
        buildTrayMenu(
          snapshot({ accounts: [accountOverview({ unread }), { ...home, unread: 0 }] }),
        ),
      ).at(-1)?.sublabel;
    expect([total(0), total(1), total(2), total(4), total(5)]).toEqual([
      '0 neprečítaných',
      '1 neprečítaná',
      '2 neprečítané',
      '4 neprečítané',
      '5 neprečítaných',
    ]);
  });
});
