import type { SplitMatchSubject } from '@relay/engine';
import type { Split, SplitId, SplitRule, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { RuleSplitMatcher } from '../../src';

const split = (overrides: Partial<Split> & Pick<Split, 'rules'>): Split => ({
  id: 'split_1' as SplitId,
  userId: 'user_1' as UserId,
  accountId: null,
  name: 'Klienti',
  order: 0,
  match: 'any',
  exceptions: [],
  exclusive: true,
  hideTasks: false,
  ...overrides,
});

const subject = (overrides: Partial<SplitMatchSubject> = {}): SplitMatchSubject => ({
  from: { name: 'Jana', email: 'jana@klient.sk' },
  subject: 'Objednávka č. 42',
  headers: new Map(),
  to: [{ name: null, email: 'ja@firma.sk' }],
  cc: [{ name: null, email: 'uctovnictvo@firma.sk' }],
  hasAttachments: true,
  ...overrides,
});

const matches = async (
  candidate: Split,
  message: SplitMatchSubject = subject(),
): Promise<boolean> => {
  const ids = await new RuleSplitMatcher().match({ message, jira: null, splits: [candidate] });
  return ids.includes(candidate.id);
};

const fromClient: SplitRule = { type: 'fromDomain', domain: 'klient.sk' };
const invoices: SplitRule = { type: 'subjectContains', value: 'faktúra' };

describe('RuleSplitMatcher criteria', () => {
  it('matches any rule by default and every rule in all mode', async () => {
    expect(await matches(split({ rules: [fromClient, invoices] }))).toBe(true);
    expect(await matches(split({ match: 'all', rules: [fromClient, invoices] }))).toBe(false);
    expect(
      await matches(split({ match: 'all', rules: [fromClient, { type: 'hasAttachment' }] })),
    ).toBe(true);
  });

  it('skips mail that matches an exception', async () => {
    const excepted = split({ rules: [fromClient], exceptions: [{ type: 'hasAttachment' }] });

    expect(await matches(excepted)).toBe(false);
    expect(await matches(excepted, subject({ hasAttachments: false }))).toBe(true);
  });

  it.each<[string, SplitRule, boolean]>([
    [
      'subject contains ignoring case and diacritics',
      { type: 'subjectContains', value: 'OBJEDNAVKA' },
      true,
    ],
    ['subject contains another word', invoices, false],
    [
      'recipient address in to',
      { type: 'recipient', field: 'to', match: 'address', value: 'ja@firma.sk' },
      true,
    ],
    [
      'recipient domain in cc',
      { type: 'recipient', field: 'cc', match: 'domain', value: 'firma.sk' },
      true,
    ],
    [
      'recipient cc address only in cc',
      { type: 'recipient', field: 'cc', match: 'address', value: 'ja@firma.sk' },
      false,
    ],
    [
      'recipient anywhere',
      { type: 'recipient', field: 'any', match: 'address', value: 'uctovnictvo@firma.sk' },
      true,
    ],
    ['has attachment', { type: 'hasAttachment' }, true],
  ])('%s', async (_name, rule, expected) => {
    expect(await matches(split({ rules: [rule] }))).toBe(expected);
  });

  it('never matches a message without attachments or recipients', async () => {
    const bare = subject({ to: undefined, cc: undefined, hasAttachments: undefined });

    expect(await matches(split({ rules: [{ type: 'hasAttachment' }] }), bare)).toBe(false);
    expect(
      await matches(
        split({ rules: [{ type: 'recipient', field: 'any', match: 'domain', value: 'firma.sk' }] }),
        bare,
      ),
    ).toBe(false);
  });
});
