import { Button } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { AutomationCard } from '../automations/AutomationCard';
import { useAutomationEditor } from '../automations/use-automation-editor';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

export function AutomationsSection() {
  const editor = useAutomationEditor();
  const settings = useUserSettings();
  const { accounts } = useAccountsModel();
  const locked = editor.saving || editor.loading;
  return (
    <>
      <SectionHeader title="Automatizácie">
        Keď príde nový mail, ktorý spĺňa podmienky, Relay spraví zvolené akcie. Platí iba pre nové
        maily.
      </SectionHeader>
      {editor.rules.map((rule) => (
        <AutomationCard
          key={rule.key}
          rule={rule}
          accounts={accounts}
          editing={editor.editing === rule.key}
          disabled={locked}
          onEngage={() => {
            editor.engage(rule.key);
          }}
          onChange={(change) => {
            editor.change(rule.key, change);
          }}
          onRemove={() => {
            editor.remove(rule.key);
          }}
        />
      ))}
      <div className="form">
        <div className="btns au-new">
          <Button
            variant="primary"
            disabled={locked}
            onClick={() => {
              editor.add(settings.data?.ai.defaultRunner ?? 'claude');
            }}
          >
            + Nové pravidlo
          </Button>
        </div>
      </div>
      <SettingRow
        title="Pravidlá sa synchronizujú"
        description="Rovnaké automatizácie platia na všetkých zariadeniach."
      />
    </>
  );
}
