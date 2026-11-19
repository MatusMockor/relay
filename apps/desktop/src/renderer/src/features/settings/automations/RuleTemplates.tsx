import { Icon, type StrokeIconName } from '@relay/ui';
import { SectionHeader } from '../SectionHeader';
import { RULE_TEMPLATES, type RuleTemplate } from './rule-templates';

const TEMPLATE_ICONS: Readonly<Record<RuleTemplate['id'], StrokeIconName>> = {
  jira: 'check',
  newsletter: 'inbox',
  sender: 'user',
  attachments: 'clip',
  blank: 'plus',
};

export interface RuleTemplatesProps {
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onPick: (template: RuleTemplate) => void;
}

export function RuleTemplates({ disabled, onBack, onPick }: RuleTemplatesProps) {
  return (
    <>
      <SectionHeader
        title="Nové pravidlo"
        back={{ label: 'Automatizácie', ariaLabel: 'Späť na automatizácie', onBack }}
      >
        Začni šablónou. Podmienky aj akcie potom upravíš.
      </SectionHeader>
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
