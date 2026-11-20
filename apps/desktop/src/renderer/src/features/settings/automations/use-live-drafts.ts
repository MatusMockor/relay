import type { AutomationCondition } from '@relay/shared';
import { useCallback, useState } from 'react';

export type LiveDraft = AutomationCondition | null;

export interface RowTracker {
  readonly onDirty: (id: string, raw: string | null) => void;
  readonly onLive: (id: string, draft: LiveDraft | undefined) => void;
}

const same = (left: LiveDraft | undefined, right: LiveDraft | undefined): boolean =>
  JSON.stringify(left ?? 'none') === JSON.stringify(right ?? 'none');

export const useLiveDrafts = () => {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, LiveDraft>>(new Map());
  const report = useCallback((id: string, draft: LiveDraft | undefined) => {
    setDrafts((current) => {
      if (same(current.get(id), draft)) {
        return current;
      }
      const next = new Map(current);
      next.delete(id);
      if (draft !== undefined) {
        next.set(id, draft);
      }
      return next;
    });
  }, []);
  return { drafts, report };
};
