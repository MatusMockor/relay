import { describe, expect, it } from 'vitest';
import { toSplitRules } from '../src/data/split-input';
import { overlapLine } from '../src/features/settings/splits/split-overlaps';

describe('split editor helpers', () => {
  it('words the overlap with an earlier split and an automation', () => {
    expect(overlapLine({ kind: 'split', id: 'split-jira', name: 'Jira', count: 2 })).toBe(
      '2 maily zachytí aj split Jira, ktorý je vyššie.',
    );
    expect(overlapLine({ kind: 'automation', id: 'automation-1', name: 'Faktúry', count: 1 })).toBe(
      '1 mail archivuje alebo presunie automatizácia Faktúry, v splite ho neuvidíš.',
    );
    expect(overlapLine({ kind: 'automation', id: 'automation-1', name: 'Faktúry', count: 5 })).toBe(
      '5 mailov archivuje alebo presunie automatizácia Faktúry, v splite ich neuvidíš.',
    );
  });

  it('keeps only the conditions a split understands', () => {
    expect(
      toSplitRules([
        { type: 'jiraEvent', kind: 'mention' },
        { type: 'hasAttachment' },
        { type: 'subjectContains', value: 'faktúra' },
      ]),
    ).toEqual([{ type: 'hasAttachment' }, { type: 'subjectContains', value: 'faktúra' }]);
  });
});
