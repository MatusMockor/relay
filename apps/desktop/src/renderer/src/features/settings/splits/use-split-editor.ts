import {
  isUnsupportedSplit,
  type Split,
  type SplitInput,
  supportedSplits,
  type UnsupportedSplit,
} from '@relay/shared';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { useSplits } from '../../../data/hooks/use-mail-queries';
import { useReplaceSplits } from '../../../data/hooks/use-replace-splits';
import { showToast } from '../../../state/toast-store';
import { canMove, moveRule } from '../automations/rule-order';
import { type SplitDraft, splitInputOf } from '../../../data/split-input';

export interface SplitEditor {
  readonly splits: readonly Split[];
  readonly unsupported: readonly UnsupportedSplit[];
  readonly locked: boolean;
  readonly save: (draft: SplitDraft, settled: () => void) => void;
  readonly remove: (splitId: Split['id']) => void;
  readonly reorder: (from: number, to: number) => void;
  readonly add: (input: SplitInput, onCreated: (splitId: Split['id']) => void) => void;
}

const byOrder = (left: Split, right: Split): number => left.order - right.order;

export const useSplitEditor = (): SplitEditor => {
  const query = useSplits();
  const replace = useReplaceSplits();
  const entries = query.data;
  const splits = supportedSplits(entries ?? []).sort(byOrder);
  const [saving, setSaving] = useState(false);
  const locked = saving || replace.isPending || entries === undefined;
  const persist = (
    inputs: SplitInput[],
    onSaved: (stored: readonly Split[]) => void,
    settled: () => void = () => undefined,
  ) => {
    if (locked) {
      settled();
      return;
    }
    setSaving(true);
    replace
      .mutateAsync(inputs)
      .then(
        (stored) => {
          onSaved(supportedSplits(stored));
        },
        (error: unknown) => {
          showToast(describeError(error));
        },
      )
      .finally(() => {
        setSaving(false);
        settled();
      });
  };
  const inputs = (): SplitInput[] => splits.map(splitInputOf);
  return {
    splits,
    unsupported: (entries ?? []).filter(isUnsupportedSplit),
    locked,
    save: (draft, settled) => {
      persist(
        splits.map((split) => (split.id === draft.id ? draft : splitInputOf(split))),
        () => undefined,
        settled,
      );
    },
    remove: (splitId) => {
      persist(splits.filter((split) => split.id !== splitId).map(splitInputOf), () => undefined);
    },
    reorder: (from, to) => {
      if (!canMove(splits.length, from, to)) {
        return;
      }
      persist(moveRule(inputs(), from, to), () => undefined);
    },
    add: (input, onCreated) => {
      const known = new Set(splits.map((split) => split.id));
      persist([...inputs(), input], (stored) => {
        const created = stored.find((split) => !known.has(split.id));
        if (created !== undefined) {
          onCreated(created.id);
        }
      });
    },
  };
};
