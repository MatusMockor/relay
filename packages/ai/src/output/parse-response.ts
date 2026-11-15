import type { z } from 'zod';
import { extractJson } from './extract-json';
import type { ParseResult } from './parse-result';

export function parseResponse<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  const json = extractJson(raw);
  if (!json.ok) {
    return json;
  }
  const parsed = schema.safeParse(json.value);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
