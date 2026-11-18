import type { Label } from '@relay/shared';
import { ConfirmDialog } from '@relay/ui';
import { useState } from 'react';
import { useLabels } from '../../../data/hooks/use-mail-queries';
import { useLabelColor } from '../../labels/use-label-color';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { SectionHeader } from '../SectionHeader';
import { SettingsGroup } from '../SettingsGroup';
import { LabelSettingRow } from './labels/LabelSettingRow';
import { useLabelSettings } from './labels/use-label-settings';

const byName = (left: Label, right: Label): number => left.name.localeCompare(right.name, 'sk');

export function LabelsSection() {
  const labels = useLabels();
  const model = useAccountsModel();
  const colorOf = useLabelColor();
  const settings = useLabelSettings();
  const [deleting, setDeleting] = useState<Label | null>(null);
  const all = [...(labels.data ?? [])].sort(byName);
  const groups = model.accounts
    .map((account) => ({ account, items: all.filter((label) => label.accountId === account.id) }))
    .filter((group) => group.items.length > 0);
  return (
    <>
      <SectionHeader title="Štítky">
        Štítok pridáš konverzácii klávesou L. Na IMAP účtoch sa ukladá ako kľúčové slovo správy, na
        Gmaile ako Gmail štítok.
      </SectionHeader>
      {labels.data !== undefined && groups.length === 0 ? (
        <p className="sh-note">Zatiaľ nemáš žiadne štítky.</p>
      ) : null}
      {groups.map(({ account, items }) => (
        <section key={account.id} aria-label={`Štítky účtu ${account.displayName}`}>
          {model.multi ? <SettingsGroup title={account.displayName} /> : null}
          {items.map((label) => (
            <LabelSettingRow
              key={label.id}
              label={label}
              colorOf={colorOf}
              settings={settings}
              onDelete={setDeleting}
            />
          ))}
        </section>
      ))}
      {deleting === null ? null : (
        <ConfirmDialog
          title={`Zmazať štítok „${deleting.name}“?`}
          text="Odstráni sa zo všetkých správ."
          confirmLabel="Zmazať"
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            settings.remove(deleting);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
