import type { MailAccount, RuleSuggestion } from '@relay/shared';
import { Icon, type StrokeIconName } from '@relay/ui';
import { SectionHeader } from '../SectionHeader';
import { RuleAiBar } from './rule-ai/RuleAiBar';
import { RULE_TEMPLATES, type RuleTemplate } from './rule-templates';

const TEMPLATE_ICONS: Readonly<Record<RuleTemplate['id'], StrokeIconName>> = {
  jira: 'check',
  newsletter: 'inbox',
  sender: 'user',
  attachments: 'clip',
  blank: 'plus',
};

export interface RuleTemplatesProps {
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onPick: (template: RuleTemplate) => void;
  readonly onSuggest: (suggestion: RuleSuggestion, sentence: string) => void;
}

export function RuleTemplates({
  accounts,
  disabled,
  onBack,
  onPick,
  onSuggest,
}: RuleTemplatesProps) {
  return (
    <>
      <SectionHeader
        title="Nové pravidlo"
        back={{ label: 'Automatizácie', ariaLabel: 'Späť na automatizácie', onBack }}
      >
        Opíš pravidlo vlastnými slovami alebo začni šablónou. Podmienky aj akcie potom upravíš.
      </SectionHeader>
      <RuleAiBar
        accountId={null}
        accounts={accounts}
        disabled={disabled}
        note={null}
        onSuggest={onSuggest}
      />
      <div className="au-tpls">
        {RULE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="au-tpl"
            aria-label={`Šablóna ${template.title}`}
            disabled={disabled}
            onClick={() => {
              onPick(template);
            }}
          >
            <span className="au-tpl-i" aria-hidden="true">
              <Icon name={TEMPLATE_ICONS[template.id]} size={16} />
            </span>
            <b>{template.title}</b>
            <span>{template.description}</span>
          </button>
        ))}
      </div>
    </>
  );
}
