import type { AutomationCondition, AutomationConditionType } from '@relay/shared';
import { useEffect, useMemo, useState } from 'react';
import { type ConditionDraft, conditionOf, draftOf } from './condition-draft';
import { freshDraft, isBlank } from './condition-fields';
import type { RowTracker } from './use-live-drafts';

export interface ConditionDraftOptions {
  readonly id: string;
  readonly saved: AutomationCondition | null;
  readonly freshType: AutomationConditionType;
  readonly onSave: (condition: AutomationCondition) => void;
  readonly tracker: RowTracker;
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
  tracker,
}: ConditionDraftOptions): ConditionDraftState => {
  const { onDirty, onLive } = tracker;
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
  const dirty = fresh || keyOf(conditionOf(draft)) !== baseline;
  const raw = dirty ? JSON.stringify(draft) : null;
  const live = useMemo(
    () => (fresh && isBlank(draft) ? undefined : conditionOf(draft)),
    [draft, fresh],
  );
  useEffect(() => {
    onLive(id, live);
  }, [id, live, onLive]);
  useEffect(
    () => () => {
      onLive(id, undefined);
    },
    [id, onLive],
  );
  useEffect(() => {
    onDirty(id, raw);
    return () => {
      onDirty(id, null);
    };
  }, [id, raw, onDirty]);
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
