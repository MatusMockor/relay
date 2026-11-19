import { Button } from '@relay/ui';
import { useState } from 'react';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { AutomationDetail } from '../automations/AutomationDetail';
import { AutomationList } from '../automations/AutomationList';
import { RuleTemplates } from '../automations/RuleTemplates';
import { useAutomationEditor } from '../automations/use-automation-editor';
import { useDefaultRule } from '../automations/use-default-rule';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'detail' }
  | { readonly kind: 'templates' };

const LIST: View = { kind: 'list' };

export function AutomationsSection() {
  const editor = useAutomationEditor();
  const defaultRule = useDefaultRule();
  const settings = useUserSettings();
  const { accounts } = useAccountsModel();
  const [view, setView] = useState<View>(LIST);
  const locked = editor.saving || editor.loading || defaultRule.restoring;
  const opened = editor.rules.find((rule) => rule.key === editor.editing);
  const showList = () => {
    editor.engage(null);
    setView(LIST);
  };
  if (view.kind === 'templates') {
    return (
      <RuleTemplates
        disabled={locked}
        onBack={showList}
        onPick={(template) => {
          editor.addFrom(template, settings.data?.ai.defaultRunner ?? 'claude');
          setView({ kind: 'detail' });
        }}
      />
    );
  }
  if (view.kind === 'detail' && opened !== undefined) {
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
            setView({ kind: 'templates' });
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
          editor.engage(key);
          setView({ kind: 'detail' });
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
