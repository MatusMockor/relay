import {
  isKeepSplitInput,
  ReplaceSplitsBodySchema,
  type Split,
  type SplitInput,
  SplitPreviewBodySchema,
  type SplitReplaceItem,
  splitCriteria,
  splitInputsOf,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { Organizer } from '../MailClient';
import { demoRuleMatches } from './demo-automation-match';
import { demoPreviewResponse, demoRecentMatches } from './demo-recent-matches';
import { demoSplitOverlaps } from './demo-split-overlap';
import type { DemoState } from './demo-state';
import { demoIds } from './seed/ids';
import { settled } from './settled';

type DemoSplitMethods = Pick<Organizer, 'listSplits' | 'replaceSplits' | 'previewSplit'>;

const UNSUPPORTED_EXCEPTION = 'Ukážka nevie vyhodnotiť výnimku na hlavičku mailu.';

const invalid = (message: string): MailClientError =>
  new MailClientError({ code: 'validation_failed', message });

const toSplit = (state: DemoState, input: SplitInput, key: string): Split => {
  const existing = state.splits.find((split) => split.id === input.id);
  return {
    ...input,
    id: input.id ?? demoIds.split(key),
    userId: demoIds.user,
    match: input.match ?? existing?.match ?? 'any',
    exceptions: input.exceptions ?? existing?.exceptions ?? [],
  };
};

const sameRules = (left: Split | undefined, right: Split): boolean =>
  left !== undefined &&
  left.accountId === right.accountId &&
  JSON.stringify(splitCriteria(left)) === JSON.stringify(splitCriteria(right));

const refreshMembership = (state: DemoState, previous: readonly Split[]): void => {
  const known = new Set(state.splits.map((split) => split.id));
  const changed = state.splits.filter(
    (split) =>
      !sameRules(
        previous.find((item) => item.id === split.id),
        split,
      ),
  );
  state.threads.forEach((record) => {
    const kept = record.summary.splitIds.filter(
      (id) => known.has(id) && !changed.some((split) => split.id === id),
    );
    const added = changed
      .filter(
        (split) =>
          (split.accountId === null || split.accountId === record.summary.accountId) &&
          demoRuleMatches(splitCriteria(split), record),
      )
      .map((split) => split.id);
    record.summary = { ...record.summary, splitIds: [...kept, ...added] };
  });
};

const replace = (state: DemoState, items: SplitReplaceItem[], stamp: number): Split[] => {
  const parsed = ReplaceSplitsBodySchema.safeParse({ splits: items });
  if (!parsed.success) {
    throw invalid('Split nie je platný');
  }
  if (
    splitInputsOf(parsed.data.splits).some((input) =>
      (input.exceptions ?? []).some((rule) => rule.type === 'header'),
    )
  ) {
    throw invalid(UNSUPPORTED_EXCEPTION);
  }
  const previous = state.splits;
  state.splits = parsed.data.splits
    .flatMap((item, order) =>
      isKeepSplitInput(item)
        ? previous.filter((split) => split.id === item.id)
        : [toSplit(state, item, `n${String(order)}-${String(stamp)}`)],
    )
    .map((split, order) => ({ ...split, order }));
  refreshMembership(state, previous);
  return [...state.splits];
};

export const createDemoSplits = (state: DemoState, now: () => Date): DemoSplitMethods => ({
  listSplits: () => Promise.resolve([...state.splits]),
  replaceSplits: (items) => settled(() => replace(state, items, now().getTime())),
  previewSplit: (body) =>
    settled(() => {
      const parsed = SplitPreviewBodySchema.safeParse(body);
      if (!parsed.success) {
        throw invalid('Split nie je platný');
      }
      const matches = demoRecentMatches(
        state,
        now,
        parsed.data.accountId,
        splitCriteria(parsed.data),
      );
      return {
        ...demoPreviewResponse(matches),
        overlaps: demoSplitOverlaps(state, parsed.data.splitId, matches),
      };
    }),
});
