import { describe, expect, it } from 'vitest';
import { ReplaceSplitsBodySchema, SplitPreviewBodySchema } from '../src/api';
import {
  isSplitRuleType,
  SPLIT_RULE_TYPES,
  SplitEntriesSchema,
  SplitSchema,
  splitCriteria,
  splitEntryOf,
} from '../src/domain';

const legacy = {
  id: 'split_1',
  userId: 'usr_1',
  accountId: null,
  name: 'Klienti',
  order: 1,
  rules: [{ type: 'fromDomain', domain: 'klient.sk' }],
  exclusive: true,
};

describe('split schema', () => {
  it('reads a split stored before match mode and exceptions as any with no exceptions', () => {
    expect(SplitSchema.parse(legacy)).toEqual({
      ...legacy,
      match: 'any',
      exceptions: [],
      hideTasks: false,
    });
  });

  it('accepts the shared conditions that make sense for thread classification', () => {
    const split = SplitSchema.parse({
      ...legacy,
      match: 'all',
      rules: [
        { type: 'subjectContains', value: ' faktúra ' },
        { type: 'recipient', field: 'cc', match: 'domain', value: 'firma.sk' },
        { type: 'hasAttachment' },
      ],
      exceptions: [{ type: 'fromAddress', address: 'noreply@klient.sk' }],
    });

    expect(split.rules[0]).toEqual({ type: 'subjectContains', value: 'faktúra' });
    expect(splitCriteria(split)).toEqual({
      match: 'all',
      conditions: split.rules,
      exceptions: split.exceptions,
    });
  });

  it('rejects Jira event conditions, which splits cannot evaluate', () => {
    expect(
      SplitSchema.safeParse({ ...legacy, rules: [{ type: 'jiraEvent', kind: 'mention' }] }).success,
    ).toBe(false);
    expect(isSplitRuleType('jiraEvent')).toBe(false);
    expect(SPLIT_RULE_TYPES).toContain('subjectContains');
  });

  it('caps exceptions at 20', () => {
    const exceptions = Array.from({ length: 21 }, () => ({ type: 'hasAttachment' }));

    expect(SplitSchema.safeParse({ ...legacy, exceptions }).success).toBe(false);
  });
});

describe('split entries', () => {
  it('marks a split with newer conditions as unsupported and keeps its tab metadata', () => {
    expect(splitEntryOf({ ...legacy, rules: [{ type: 'future' }], match: 'some' })).toEqual({
      kind: 'unsupported',
      id: 'split_1',
      accountId: null,
      name: 'Klienti',
      order: 1,
      exclusive: true,
      hideTasks: false,
    });
  });

  it('refuses a split that is broken outside the newer fields', () => {
    expect(splitEntryOf({ ...legacy, name: '' })).toBeNull();
    expect(SplitEntriesSchema.safeParse([{ ...legacy, order: -1 }]).success).toBe(false);
  });
});

describe('split inputs', () => {
  it('lets an older client omit match and exceptions and accepts kept splits', () => {
    const body = ReplaceSplitsBodySchema.parse({
      splits: [
        { accountId: null, name: 'Klienti', order: 0, rules: legacy.rules, exclusive: true },
        { id: 'split_2', keep: true },
      ],
    });

    expect(body.splits[0]).not.toHaveProperty('match');
    expect(body.splits[0]).not.toHaveProperty('exceptions');
    expect(body.splits[1]).toEqual({ id: 'split_2', keep: true });
  });

  it('needs at least one rule for a preview', () => {
    const preview = { splitId: null, accountId: null, match: 'any', exceptions: [] };

    expect(SplitPreviewBodySchema.safeParse({ ...preview, rules: [] }).success).toBe(false);
    expect(SplitPreviewBodySchema.safeParse({ ...preview, rules: legacy.rules }).success).toBe(
      true,
    );
  });
});
