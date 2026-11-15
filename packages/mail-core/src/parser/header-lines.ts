import type { MessageHeaders } from '@relay/engine';
import type { HeaderLines } from 'mailparser';

const unfold = (line: string): string => line.replace(/\r?\n[ \t]+/g, ' ');

const headerValue = (line: string): string => {
  const separator = line.indexOf(':');
  return unfold(separator === -1 ? '' : line.slice(separator + 1)).trim();
};

export const toMessageHeaders = (lines: HeaderLines): MessageHeaders => {
  const headers = new Map<string, string[]>();
  for (const { key, line } of lines) {
    const name = key.toLowerCase();
    const values = headers.get(name) ?? [];
    values.push(headerValue(line));
    headers.set(name, values);
  }
  return headers;
};
