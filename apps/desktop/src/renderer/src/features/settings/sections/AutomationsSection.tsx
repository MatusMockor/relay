import type { RuleSuggestion } from '@relay/shared';
import { Button } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { AutomationDetail } from '../automations/AutomationDetail';
import { AutomationList } from '../automations/AutomationList';
import { DescribeRule } from '../automations/DescribeRule';
import { useStagedCleanup } from '../automations/rule-ai/use-staged-cleanup';
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
  useStagedCleanup(editor.rules, opened?.key ?? null, editor.discard);
  const runner = settings.data?.ai.defaultRunner ?? 'claude';
  const showList = () => {
    showAutomationView({ kind: 'list' });
  };
  const addProposed = (suggestion: RuleSuggestion, sentence: string) => {
    const key = editor.addProposed(runner, suggestion, sentence);
    showAutomationView({ kind: 'detail', key });
  };
  if (view.kind === 'templates') {
    return (
      <RuleTemplates
        accounts={accounts}
        disabled={locked}
        onBack={showList}
        onPick={(template) => {
          const key = editor.addFrom(template, runner);
          showAutomationView({ kind: 'detail', key });
        }}
        onSuggest={addProposed}
      />
    );
  }
  if (opened !== undefined) {
    return (
      <AutomationDetail
        key={`${opened.key}#${String(opened.suggestion?.id ?? 0)}`}
        rule={opened}
        accounts={accounts}
        disabled={locked}
        onBack={showList}
        onChange={(change) => {
          editor.change(opened.key, change);
        }}
        onPropose={(suggestion, sentence) => {
          editor.propose(opened.key, suggestion, sentence);
        }}
        onDiscard={() => {
          editor.discard(opened.key);
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
      <DescribeRule
        accounts={accounts}
        disabled={locked}
        onNew={() => {
          showAutomationView({ kind: 'templates' });
        }}
        onSuggest={addProposed}
      />
      <AutomationList
        rules={editor.rules}
        unsupported={editor.unsupported}
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
