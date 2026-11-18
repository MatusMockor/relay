import type { MailAccount, UpdateAccountBody } from '@relay/shared';
import { AccountSquare, Button, ConfirmDialog, Segmented, Status, Switch } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useClient } from '../../../data/hooks/services-context';
import { useAccounts } from '../../../data/hooks/use-mail-queries';
import { listTimeLabel } from '../../../lib/dates';
import { showToast } from '../../../state/toast-store';
import { setUi } from '../../../state/ui-store';
import { AddAccountForm } from '../../accounts/AddAccountForm';
import { accountLike } from '../../mail/use-accounts-model';
import { SettingRow } from '../SettingRow';
import { AccountNameRows } from './AccountNameRows';
import { SectionHeader } from '../SectionHeader';

export const SYNC_OPTIONS = [
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
  { value: '1800', label: '30 min' },
] as const;

const COLORS = ['#6aa8ff', '#74c4a2', '#d9a878', '#d48fa8', '#8ea2ff', '#f2b45a'];
const STATUS: Readonly<Record<MailAccount['status'], string>> = {
  connected: 'Pripojené',
  syncing: 'Synchronizujem…',
  error: 'Chyba',
  disconnected: 'Odpojené',
};

function AccountCard({
  account,
  onRemove,
}: {
  readonly account: MailAccount;
  readonly onRemove: () => void;
}) {
  const client = useClient();
  const queryClient = useQueryClient();
  const patch = (body: UpdateAccountBody) => {
    client
      .updateAccount(account.id, body)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.accounts() }))
      .catch((error: unknown) => {
        showToast(describeError(error));
      });
  };
  const synced =
    account.lastSyncedAt === null
      ? 'zatiaľ nesynchronizované'
      : `posledná synchronizácia ${listTimeLabel(account.lastSyncedAt, new Date())}`;
  return (
    <section className="acc-card" aria-label={account.displayName}>
      <div className="acc-h">
        <AccountSquare account={accountLike(account)} />
        <div className="l">
          <b>{account.displayName}</b>
          <span>{account.email}</span>
        </div>
        <span className="chip">
          {account.provider === 'gmail'
            ? 'Gmail'
            : account.provider === 'outlook'
              ? 'Outlook'
              : 'IMAP'}
        </span>
        {account.isPrimary ? <span className="chip pri">Hlavný</span> : null}
      </div>
      <AccountNameRows account={account} onPatch={patch} />
      <SettingRow
        title="Stav"
        description={`${account.settings.imap.host}:${String(account.settings.imap.port)} · ${synced}${account.lastError === null ? '' : ` · ${account.lastError}`}`}
      >
        <Status
          tone={
            account.status === 'connected' ? 'ok' : account.status === 'syncing' ? 'busy' : 'bad'
          }
          label={STATUS[account.status]}
        />
      </SettingRow>
      <SettingRow
        title="Interval synchronizácie"
        description={`Každých ${String(Math.round(account.syncIntervalSeconds / 60))} min`}
      >
        <Segmented
          label="Interval"
          value={String(account.syncIntervalSeconds)}
          options={SYNC_OPTIONS}
          onChange={(value) => {
            patch({ syncIntervalSeconds: Number(value) });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Hlavný účet"
        description="Predvolený odosielateľ, keď píšeš zo zobrazenia Všetky účty"
      >
        <Switch
          checked={account.isPrimary}
          label={`Hlavný účet ${account.displayName}`}
          onChange={(next) => {
            if (next) {
              patch({ isPrimary: true });
              return;
            }
            showToast('Hlavný účet je vždy jeden. Zapni ho na inom účte.');
          }}
        />
      </SettingRow>
      <SettingRow title="Farba" description="Bodka pri mailoch v zobrazení Všetky účty">
        <span className="swatches">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch${color === account.color ? ' on' : ''}`}
              style={{ ['--a' as string]: color }}
              aria-label={`Farba ${color}`}
              aria-pressed={color === account.color}
              onClick={() => {
                patch({ color });
              }}
            />
          ))}
        </span>
      </SettingRow>
      <div className="acc-f">
        <Button variant="danger" onClick={onRemove}>
          Odpojiť
        </Button>
      </div>
    </section>
  );
}

export function AccountsSection({ adding }: { readonly adding: boolean }) {
  const accounts = useAccounts();
  const client = useClient();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<MailAccount | null>(null);
  const setAdding = (value: boolean) => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: value } });
  };
  if (adding) {
    return (
      <>
        <SectionHeader
          title="Pridať účet"
          back={{
            label: 'Účty',
            onBack: () => {
              setAdding(false);
            },
          }}
        >
          Relay sa pripojí k schránke a stiahne posledných 30 dní pošty.
        </SectionHeader>
        <AddAccountForm
          onDone={() => {
            setAdding(false);
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      </>
    );
  }
  return (
    <>
      <SectionHeader title="Účty">
        Každý účet sa synchronizuje samostatne. Heslá a tokeny ostávajú na serveri alebo v
        zabezpečenom úložisku zariadenia.
      </SectionHeader>
      {(accounts.data ?? []).map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onRemove={() => {
            setRemoving(account);
          }}
        />
      ))}
      <div className="add-acc">
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          Pridať účet
        </Button>
      </div>
      {removing === null ? null : (
        <ConfirmDialog
          title={`Odpojiť účet ${removing.displayName}?`}
          text={`Maily z ${removing.email} zmiznú z appky, na serveri ostanú. Účet môžeš kedykoľvek pripojiť znova.`}
          confirmLabel="Odpojiť"
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            client
              .removeAccount(target.id)
              .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.all }))
              .then(() => {
                showToast(`Účet ${target.displayName} je odpojený`);
              })
              .catch((error: unknown) => {
                showToast(describeError(error));
              });
          }}
        />
      )}
    </>
  );
}
