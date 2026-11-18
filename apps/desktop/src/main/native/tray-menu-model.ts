import type { AccountScope } from '@relay/shared/ipc';
import type { NotificationPauseState } from './notification-pause';
import type { TrayAccount } from './tray-accounts';
import { trayAccountItems } from './tray-account-items';
import { pauseLabel, syncStatusLabel } from './tray-labels';
import type { TrayMenuItem, TrayTone } from './tray-menu-items';
import { type TraySyncStatus, traySyncStatusOf } from './tray-sync-status';

export interface TrayMenuSnapshot {
  readonly appName: string;
  readonly accounts: readonly TrayAccount[];
  readonly scope: AccountScope;
  readonly pause: NotificationPauseState;
  readonly now: Date;
}

const TONES: Readonly<Record<TraySyncStatus['kind'], TrayTone>> = {
  'no-accounts': 'idle',
  waiting: 'idle',
  syncing: 'busy',
  failed: 'failed',
  synced: 'ok',
};

const statusItem = (snapshot: TrayMenuSnapshot): TrayMenuItem => {
  const status = traySyncStatusOf(snapshot.accounts);
  return { kind: 'status', label: syncStatusLabel(status, snapshot.now), tone: TONES[status.kind] };
};

const pausedItems = (pause: NotificationPauseState, now: Date): TrayMenuItem[] => {
  if (pause.kind === 'active') {
    return [];
  }
  return [
    { kind: 'note', label: pauseLabel(pause, now) },
    { kind: 'action', label: 'Obnoviť notifikácie', action: { type: 'resume-notifications' } },
  ];
};

const pauseSubmenu: TrayMenuItem = {
  kind: 'submenu',
  label: 'Pozastaviť notifikácie',
  items: [
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
  ],
};

export const buildTrayMenu = (snapshot: TrayMenuSnapshot): TrayMenuItem[] => [
  statusItem(snapshot),
  { kind: 'separator' },
  { kind: 'action', label: `Otvoriť ${snapshot.appName}`, action: { type: 'show-window' } },
  { kind: 'action', label: 'Nová správa', action: { type: 'compose' } },
  ...trayAccountItems(snapshot.accounts, snapshot.scope),
  { kind: 'separator' },
  { kind: 'action', label: 'Synchronizovať teraz', action: { type: 'sync-now' } },
  ...pausedItems(snapshot.pause, snapshot.now),
  pauseSubmenu,
  { kind: 'separator' },
  {
    kind: 'action',
    label: 'Nastavenia…',
    action: { type: 'open-settings', section: 'accounts' },
    accelerator: 'CmdOrCtrl+,',
  },
  { kind: 'action', label: 'Skontrolovať aktualizácie…', action: { type: 'check-updates' } },
  { kind: 'action', label: `O aplikácii ${snapshot.appName}`, action: { type: 'open-about' } },
  { kind: 'separator' },
  {
    kind: 'action',
    label: `Ukončiť ${snapshot.appName}`,
    action: { type: 'quit' },
    accelerator: 'CmdOrCtrl+Q',
  },
];
