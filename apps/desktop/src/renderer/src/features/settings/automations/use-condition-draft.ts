import type { AutomationCondition, AutomationConditionType } from '@relay/shared';
import { useEffect, useState } from 'react';
import { type ConditionDraft, conditionOf, draftOf } from './condition-draft';
import { freshDraft, isBlank } from './condition-fields';

export interface ConditionDraftOptions {
  readonly id: string;
  readonly saved: AutomationCondition | null;
  readonly freshType: AutomationConditionType;
  readonly onSave: (condition: AutomationCondition) => void;
  readonly onDirty: (id: string, dirty: boolean) => void;
}

export interface ConditionDraftState {
  readonly draft: ConditionDraft;
  readonly fresh: boolean;
  readonly invalid: boolean;
  readonly pick: (change: Partial<ConditionDraft>) => void;
  readonly edit: (change: Partial<ConditionDraft>) => void;
  readonly commit: (strict: boolean) => void;
}

const draftFor = (condition: AutomationCondition | null, type: AutomationConditionType) =>
  condition === null ? freshDraft(type) : draftOf(condition);

const keyOf = (condition: AutomationCondition | null): string => JSON.stringify(condition);

export const useConditionDraft = ({
  id,
  saved,
  freshType,
  onSave,
  onDirty,
}: ConditionDraftOptions): ConditionDraftState => {
  const [draft, setDraft] = useState(() => draftFor(saved, freshType));
  const [invalid, setInvalid] = useState(false);
  const [seen, setSeen] = useState(() => keyOf(saved));
  if (seen !== keyOf(saved)) {
    setSeen(keyOf(saved));
    setDraft(draftFor(saved, freshType));
    setInvalid(false);
  }
  const fresh = saved === null;
  const baseline = keyOf(saved === null ? null : conditionOf(draftOf(saved)));
  const dirty = fresh ? !isBlank(draft) : keyOf(conditionOf(draft)) !== baseline;
  useEffect(() => {
    onDirty(id, dirty);
    return () => {
      onDirty(id, false);
    };
  }, [id, dirty, onDirty]);
  const attempt = (next: ConditionDraft, strict: boolean) => {
    const condition = conditionOf(next);
    setInvalid(condition === null && strict);
    if (condition === null || (!fresh && keyOf(condition) === baseline)) {
      return;
    }
    onSave(condition);
  };
  return {
    draft,
    fresh,
    invalid,
    pick: (change) => {
      const next = { ...draft, ...change };
      setDraft(next);
      attempt(next, false);
    },
    edit: (change) => {
      setInvalid(false);
      setDraft((current) => ({ ...current, ...change }));
    },
    commit: (strict) => {
      attempt(draft, strict || !(fresh && isBlank(draft)));
    },
  };
};
