import { setUi } from '../../../state/ui-store';
import { nextDraftKey } from './draft-key';
import type { EditableRule, RuleInput } from './editable-rule';

let seeded: EditableRule | null = null;

export const seededDrafts = (): ReadonlyMap<string, EditableRule> =>
  seeded === null ? new Map() : new Map([[seeded.key, seeded]]);

export const clearSeededRule = (): void => {
  seeded = null;
};

export const openSeededRule = (input: RuleInput): void => {
  const rule: EditableRule = {
    key: nextDraftKey(),
    preset: null,
    saved: false,
    pending: null,
    input,
  };
  seeded = rule;
  setUi({
    overlay: {
      kind: 'settings',
      section: 'automations',
      adding: false,
      automation: { kind: 'detail', key: rule.key },
    },
  });
};
