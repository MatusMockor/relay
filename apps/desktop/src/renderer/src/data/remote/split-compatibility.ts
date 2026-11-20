import {
  api,
  isUnsupportedSplit,
  type Split,
  type SplitEntry,
  type SplitInput,
  type SplitReplaceItem,
  splitInputsOf,
  supportedSplits,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { splitInputOf } from '../split-input';
import type { HttpApi } from './HttpApi';

export const OUTDATED_SPLITS =
  'Server je starší a nepodporuje režim podmienok ani výnimky v splitoch. Aktualizuj server.';

export const OUTDATED_SPLIT_PREVIEW =
  'Server je starší a nepodporuje náhľad splitu. Aktualizuj server.';

const usesNewFields = (input: SplitInput): boolean =>
  input.match === 'all' || (input.exceptions?.length ?? 0) > 0;

const counterpartOf = (input: SplitInput, stored: readonly Split[]): Split | undefined =>
  stored.find((split) =>
    input.id === undefined
      ? split.order === input.order && split.name === input.name
      : split.id === input.id,
  );

const keeps = (input: SplitInput, split: Split | undefined): boolean =>
  split !== undefined &&
  (input.match === undefined || split.match === input.match) &&
  (input.exceptions === undefined || split.exceptions.length === input.exceptions.length);

const restoreOf = (entry: SplitEntry): SplitReplaceItem =>
  isUnsupportedSplit(entry) ? { id: entry.id, keep: true } : splitInputOf(entry);

export const replaceSplitsChecked = async (
  http: HttpApi,
  items: SplitReplaceItem[],
): Promise<SplitEntry[]> => {
  const risky = splitInputsOf(items).filter(usesNewFields);
  const previous = risky.length === 0 ? null : await http.call(api.splits.list, {});
  const stored = await http.call(api.splits.replace, { body: { splits: items } });
  const saved = supportedSplits(stored);
  if (previous === null || risky.every((input) => keeps(input, counterpartOf(input, saved)))) {
    return stored;
  }
  await http
    .call(api.splits.replace, { body: { splits: previous.map(restoreOf) } })
    .catch(() => undefined);
  throw new MailClientError({ code: 'not_implemented', message: OUTDATED_SPLITS });
};

export const outdatedSplitPreview = (error: unknown): unknown =>
  error instanceof MailClientError && error.status === 404
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_SPLIT_PREVIEW }, 404)
    : error;
