import { describe, expect, it } from 'vitest';
import { AutomationEntriesSchema, automationEntryOf } from '../src/domain/automation-entry';

const stored = {
  id: 'aut_1',
  userId: 'usr_1',
  accountId: null,
  name: 'Faktúry',
  enabled: true,
  order: 2,
  preset: null,
  match: 'all',
  conditions: [{ type: 'fromDomain', domain: 'faktury.sk' }],
  exceptions: [],
  ai: { runner: 'claude', model: null, effort: null, instructions: null },
  actions: [{ type: 'markRead' }],
};

const unsupported = {
  kind: 'unsupported',
  id: 'aut_1',
  name: 'Faktúry',
  enabled: true,
  order: 2,
  accountId: null,
};

describe('automation entries', () => {
  it('reads a rule this version understands as a rule', () => {
    expect(automationEntryOf(stored)).toEqual(stored);
  });

  it('keeps a rule with an unknown action or condition as an unsupported entry', () => {
    expect(
      automationEntryOf({ ...stored, actions: [{ type: 'translate', language: 'de' }] }),
    ).toEqual(unsupported);
    expect(
      automationEntryOf({ ...stored, conditions: [{ type: 'sentiment', value: 'angry' }] }),
    ).toEqual(unsupported);
    expect(automationEntryOf({ ...stored, actions: [{ type: 'remind', afterDays: 90 }] })).toEqual(
      unsupported,
    );
    expect(automationEntryOf(unsupported)).toEqual(unsupported);
  });

  it('refuses a broken rule instead of hiding it', () => {
    expect(automationEntryOf({ ...stored, name: 7 })).toBeNull();
    expect(automationEntryOf({ ...stored, ai: null, actions: [{ type: 'x' }] })).toBeNull();
    expect(AutomationEntriesSchema.safeParse([stored, { id: 'aut_2' }]).success).toBe(false);
  });

  it('parses a list per rule so one newer rule does not fail the others', () => {
    const parsed = AutomationEntriesSchema.parse([
      stored,
      { ...stored, id: 'aut_2', actions: [{ type: 'translate' }] },
    ]);

    expect(parsed).toEqual([stored, { ...unsupported, id: 'aut_2' }]);
  });
});
