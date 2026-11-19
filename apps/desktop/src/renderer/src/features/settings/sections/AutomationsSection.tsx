import { Button } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { AutomationDetail } from '../automations/AutomationDetail';
import { AutomationList } from '../automations/AutomationList';
import {
  renameAutomationDetail,
  showAutomationView,
  useAutomationView,
} from '../automations/automation-view';
import { RuleTemplates } from '../automations/RuleTemplates';
import { useAutomationEditor } from '../automations/use-automation-editor';
import { useDefaultRule } from '../automations/use-default-rule';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

export function AutomationsSection() {
  const editor = useAutomationEditor(renameAutomationDetail);
  const defaultRule = useDefaultRule();
  const settings = useUserSettings();
  const { accounts } = useAccountsModel();
  const view = useAutomationView();
  const locked = editor.saving || editor.loading || defaultRule.restoring;
  const opened =
    view.kind === 'detail' ? editor.rules.find((rule) => rule.key === view.key) : undefined;
  const showList = () => {
    showAutomationView({ kind: 'list' });
  };
  if (view.kind === 'templates') {
    return (
      <RuleTemplates
        disabled={locked}
        onBack={showList}
        onPick={(template) => {
          const key = editor.addFrom(template, settings.data?.ai.defaultRunner ?? 'claude');
          showAutomationView({ kind: 'detail', key });
        }}
      />
    );
  }
  if (opened !== undefined) {
    return (
      <AutomationDetail
        key={opened.key}
        rule={opened}
        accounts={accounts}
        disabled={locked}
        onBack={showList}
        onChange={(change) => {
          editor.change(opened.key, change);
        }}
        onRemove={() => {
          editor.remove(opened.key);
          showList();
        }}
      />
    );
  }
  return (
    <>
      <SectionHeader title="Automatizácie">
        Keď príde mail, ktorý spĺňa podmienky, Relay spraví zvolené akcie.
      </SectionHeader>
      <div className="au-bar">
        <span>Pravidlá sa vyhodnocujú zhora nadol. Poradie zmeníš potiahnutím.</span>
        <Button
          variant="primary"
          disabled={locked}
          onClick={() => {
            showAutomationView({ kind: 'templates' });
          }}
        >
          + Nové pravidlo
        </Button>
      </div>
      <AutomationList
        rules={editor.rules}
        accounts={accounts}
        disabled={locked}
        onOpen={(key) => {
          showAutomationView({ kind: 'detail', key });
        }}
        onToggle={(key, enabled) => {
          editor.change(key, { enabled });
        }}
        onMove={(from, to) => {
          editor.reorder(from, to);
        }}
      />
      {defaultRule.removed ? (
        <div className="au-new">
          <Button
            disabled={locked}
            onClick={() => {
              defaultRule.restore();
            }}
          >
            Obnoviť predvolené Jira pravidlo
          </Button>
        </div>
      ) : null}
      <SettingRow
        title="Pravidlá sa synchronizujú"
        description="Rovnaké automatizácie platia na všetkých zariadeniach."
      />
    </>
  );
}
