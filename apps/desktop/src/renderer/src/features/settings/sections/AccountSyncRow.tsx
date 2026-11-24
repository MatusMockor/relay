import type { MailAccount } from '@relay/shared';
import { Status, type StatusTone } from '@relay/ui';
import { useSyncProgress } from '../../../data/hooks/use-sync-progress';
import { listTimeLabel } from '../../../lib/dates';
import { SettingRow } from '../SettingRow';
import { summarizeSyncProgress } from './sync-progress-summary';

const STATUS: Readonly<Record<MailAccount['status'], string>> = {
  connected: 'Pripojené',
  syncing: 'Synchronizujem…',
  error: 'Chyba',
  disconnected: 'Odpojené',
};

const TONE: Readonly<Record<MailAccount['status'], StatusTone>> = {
  connected: 'ok',
  syncing: 'busy',
  error: 'bad',
  disconnected: 'bad',
};

const syncedLabel = (account: MailAccount): string =>
  account.lastSyncedAt === null
    ? 'zatiaľ nesynchronizované'
    : `posledná synchronizácia ${listTimeLabel(account.lastSyncedAt, new Date())}`;

export function AccountSyncRow({ account }: { readonly account: MailAccount }) {
  const progress = useSyncProgress(account.id);
  const summary = account.status === 'syncing' ? summarizeSyncProgress(progress) : null;
  const { host, port } = account.settings.imap;
  const state = summary?.text ?? syncedLabel(account);
  const error = account.lastError === null ? '' : ` · ${account.lastError}`;
  return (
    <SettingRow title="Stav" description={`${host}:${String(port)} · ${state}${error}`}>
      {summary === null ? null : (
        <div
          className="hist-bar"
          role="progressbar"
          aria-label={`Synchronizácia ${account.displayName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(summary.ratio * 100)}
        >
          <i style={{ width: `${String(summary.ratio * 100)}%` }} />
        </div>
      )}
      <Status tone={TONE[account.status]} label={STATUS[account.status]} />
    </SettingRow>
  );
}
