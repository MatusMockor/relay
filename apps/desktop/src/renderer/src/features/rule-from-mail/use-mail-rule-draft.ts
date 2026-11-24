import type { AutomationAction } from '@relay/shared';
import { useState } from 'react';
import { defaultSelection, type MailRuleOption, type MailRuleOptionId } from './mail-rule-options';
import { NEWSLETTER_ACTIONS } from './quick-actions';

export interface MailRuleDraft {
  readonly selected: ReadonlySet<MailRuleOptionId>;
  readonly actions: readonly AutomationAction[];
  readonly applyExisting: boolean;
  readonly toggleOption: (id: MailRuleOptionId) => void;
  readonly setActions: (actions: readonly AutomationAction[]) => void;
  readonly setApplyExisting: (on: boolean) => void;
}

const initialActions = (options: readonly MailRuleOption[]): readonly AutomationAction[] =>
  options.some((option) => option.id === 'newsletter') ? NEWSLETTER_ACTIONS : [];

const toggled = <Item>(set: ReadonlySet<Item>, item: Item): ReadonlySet<Item> => {
  const next = new Set(set);
  if (!next.delete(item)) {
    next.add(item);
  }
  return next;
};

export const useMailRuleDraft = (options: readonly MailRuleOption[]): MailRuleDraft => {
  const [selected, setSelected] = useState<ReadonlySet<MailRuleOptionId>>(
    () => new Set(defaultSelection(options)),
  );
  const [actions, setActions] = useState(() => initialActions(options));
  const [applyExisting, setApplyExisting] = useState(false);
  return {
    selected,
    actions,
    applyExisting,
    toggleOption: (id) => {
      setSelected((current) => toggled(current, id));
    },
    setActions,
    setApplyExisting,
  };
};
