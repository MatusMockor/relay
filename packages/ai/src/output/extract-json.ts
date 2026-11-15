import type { ParseResult } from './parse-result';

const FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

export function extractJson(raw: string): ParseResult<unknown> {
  const candidates = jsonCandidates(raw.trim());
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed.ok) {
      return parsed;
    }
  }
  return { ok: false, error: 'Response does not contain a valid JSON object' };
}

function jsonCandidates(text: string): string[] {
  const fenced = FENCE_PATTERN.exec(text)?.[1]?.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const braced = start >= 0 && end > start ? text.slice(start, end + 1) : null;
  return [text, fenced, braced].filter((value): value is string => typeof value === 'string');
}

function tryParse(candidate: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(candidate) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
