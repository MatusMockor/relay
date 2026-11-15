import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson } from '../src/output/extract-json';
import { parseResponse } from '../src/output/parse-response';

const Schema = z.strictObject({ text: z.string().min(1) });

describe('output parser', () => {
  it('parses plain, fenced and prose-wrapped JSON', () => {
    expect(parseResponse('{"text":"a"}', Schema)).toEqual({ ok: true, value: { text: 'a' } });
    expect(parseResponse('```json\n{"text":"b"}\n```', Schema)).toEqual({
      ok: true,
      value: { text: 'b' },
    });
    expect(parseResponse('Nech sa páči:\n{"text":"c"}\nHotovo.', Schema)).toEqual({
      ok: true,
      value: { text: 'c' },
    });
  });

  it('reports missing JSON', () => {
    expect(extractJson('Žiadny JSON')).toEqual({
      ok: false,
      error: 'Response does not contain a valid JSON object',
    });
  });

  it('reports schema violations with paths, including unknown keys', () => {
    const tooShort = parseResponse('{"text":""}', Schema);
    expect(tooShort.ok ? '' : tooShort.error).toContain('text:');
    expect(parseResponse('{"text":"a","extra":1}', Schema)).toMatchObject({ ok: false });
  });
});
