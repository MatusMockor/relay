import { ThreadIdSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { parseAnswer } from '../src/features/side/answer-links';

const id = (value: string) => ThreadIdSchema.parse(value);

describe('chat answer links', () => {
  it('replaces [thread:<id>] markers with thread links and keeps the text around them', () => {
    const parsed = parseAnswer('Pozri [thread:t-1] a potom [thread:t-2].', []);
    expect(parsed.parts).toEqual([
      { kind: 'text', text: 'Pozri ' },
      { kind: 'thread', threadId: 't-1' },
      { kind: 'text', text: ' a potom ' },
      { kind: 'thread', threadId: 't-2' },
      { kind: 'text', text: '.' },
    ]);
    expect(parsed.related).toEqual([]);
  });

  it('lists references that are not mentioned inline once', () => {
    const parsed = parseAnswer('Faktúra je v [thread:t-1].', [id('t-1'), id('t-2'), id('t-2')]);
    expect(parsed.related).toEqual(['t-2']);
  });

  it('falls back to the plain text when there are no markers', () => {
    expect(parseAnswer('Dnes nič nečaká.', []).parts).toEqual([
      { kind: 'text', text: 'Dnes nič nečaká.' },
    ]);
    expect(parseAnswer('Neúplné [thread:', []).parts).toEqual([
      { kind: 'text', text: 'Neúplné [thread:' },
    ]);
  });
});
