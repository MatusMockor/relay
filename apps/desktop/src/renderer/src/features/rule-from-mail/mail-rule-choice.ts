import type { AutomationCondition } from '@relay/shared';
import type { MailRuleOption, MailRuleOptionId } from './mail-rule-options';

export const FALLBACK_RULE_NAME = 'Pravidlo z mailu';

const RULE_NAME_MAX = 100;

const chosen = (
  options: readonly MailRuleOption[],
  selected: ReadonlySet<MailRuleOptionId>,
): MailRuleOption[] => options.filter((option) => selected.has(option.id));

export const choiceConditions = (
  options: readonly MailRuleOption[],
  selected: ReadonlySet<MailRuleOptionId>,
): AutomationCondition[] => {
  const seen = new Set<string>();
  return chosen(options, selected)
    .flatMap((option) => option.conditions)
    .filter((condition) => {
      const key = JSON.stringify(condition);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

export const choiceName = (
  options: readonly MailRuleOption[],
  selected: ReadonlySet<MailRuleOptionId>,
): string => (chosen(options, selected)[0]?.name ?? FALLBACK_RULE_NAME).slice(0, RULE_NAME_MAX);
