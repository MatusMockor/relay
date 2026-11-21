import {
  api,
  type Split,
  type SplitEntry,
  type SplitInput,
  type SplitReplaceItem,
  type SplitRuleType,
  splitInputsOf,
  supportedSplits,
} from '@relay/shared';
import { z } from 'zod';
import { MailClientError } from '../errors';
import type { HttpApi } from './HttpApi';

export const OUTDATED_SPLITS =
  'Server je starší a nepodporuje režim podmienok ani výnimky v splitoch. Aktualizuj server.';

export const OUTDATED_SPLIT_PREVIEW =
  'Server je starší a nepodporuje náhľad splitu. Aktualizuj server.';

const NEWER_RULE_TYPES: ReadonlySet<SplitRuleType> = new Set([
  'subjectContains',
  'recipient',
  'hasAttachment',
]);

const rawSplitList = {
  ...api.splits.list,
  response: z.array(z.record(z.string(), z.unknown())),
};

const usesNewFields = (input: SplitInput): boolean =>
  input.match === 'all' ||
  (input.exceptions?.length ?? 0) > 0 ||
  input.rules.some((rule) => NEWER_RULE_TYPES.has(rule.type));

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

const outdated = (): MailClientError =>
  new MailClientError({ code: 'not_implemented', message: OUTDATED_SPLITS });

export const replaceSplitsChecked = async (
  http: HttpApi,
  items: SplitReplaceItem[],
): Promise<SplitEntry[]> => {
  const risky = splitInputsOf(items).filter(usesNewFields);
  if (risky.length === 0) {
    return http.call(api.splits.replace, { body: { splits: items } });
  }
  const current = await http.call(rawSplitList, {});
  if (current.length > 0 && current.every((split) => !('match' in split))) {
    throw outdated();
  }
  const stored = await http.call(api.splits.replace, { body: { splits: items } });
  const saved = supportedSplits(stored);
  if (current.length > 0 || risky.every((input) => keeps(input, counterpartOf(input, saved)))) {
    return stored;
  }
  await http.call(api.splits.replace, { body: { splits: [] } });
  throw outdated();
};

export const outdatedSplitPreview = (error: unknown): unknown =>
  error instanceof MailClientError && error.status === 404
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_SPLIT_PREVIEW }, 404)
    : error;
