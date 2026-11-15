import { describe, expect, it } from 'vitest';
import { displaySubject, type JiraKey, stripJiraSubject } from '../src/domain';

const KEY = 'CMS-217' as JiraKey;

describe('stripJiraSubject', () => {
  it.each([
    ['[JIRA] (CMS-217) Editor stráca obrázky po uložení konceptu'],
    ['[Jira] (CMS-217) Editor stráca obrázky po uložení konceptu'],
    ['RE: [JIRA] (CMS-217) Editor stráca obrázky po uložení konceptu'],
    ['[JIRA] Commented: (CMS-217) Editor stráca obrázky po uložení konceptu'],
    ['[JIRA] Updates for CMS-217: Editor stráca obrázky po uložení konceptu'],
    ['[CMS-217] Editor stráca obrázky po uložení konceptu'],
    ['CMS-217: Editor stráca obrázky po uložení konceptu'],
    ['[JIRA] CMS-217 - Editor stráca obrázky po uložení konceptu'],
  ])('strips the Jira prefix and key from %s', (subject) => {
    expect(stripJiraSubject(subject, KEY)).toBe('Editor stráca obrázky po uložení konceptu');
  });

  it('keeps the key when it is part of the sentence and not a prefix', () => {
    expect(stripJiraSubject('[JIRA] Fix CMS-217 regression', KEY)).toBe('Fix CMS-217 regression');
    expect(stripJiraSubject('[JIRA] (CMS-2170) Other issue', KEY)).toBe('(CMS-2170) Other issue');
  });

  it('returns an empty title when only the prefix and key are present', () => {
    expect(stripJiraSubject('[JIRA] (CMS-217)', KEY)).toBe('');
  });
});

describe('displaySubject', () => {
  it('drops the Jira prefix and key for Jira threads', () => {
    expect(displaySubject('[JIRA] (CMS-217) Editor stráca obrázky', KEY)).toBe(
      'Editor stráca obrázky',
    );
  });

  it('keeps the subject of other threads and of Jira subjects with nothing left', () => {
    expect(displaySubject('[JIRA] (CMS-217) Editor', null)).toBe('[JIRA] (CMS-217) Editor');
    expect(displaySubject('[JIRA] (CMS-217)', KEY)).toBe('[JIRA] (CMS-217)');
  });
});
