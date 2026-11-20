import { isTraceHeader } from '@relay/engine';

export { isTraceHeader, TRACE_HEADERS } from '@relay/engine';

const fieldsOf = (lines: readonly string[]): string[][] =>
  lines.reduce<string[][]>((fields, line) => {
    const last = fields.at(-1);
    if (last !== undefined && /^[ \t]/.test(line)) {
      last.push(line);
      return fields;
    }
    fields.push([line]);
    return fields;
  }, []);

const fieldName = (field: readonly string[]): string => {
  const first = field[0] ?? '';
  const separator = first.indexOf(':');
  return separator === -1 ? first : first.slice(0, separator);
};

export const stripTraceHeaders = (header: Uint8Array): Buffer => {
  const lines = Buffer.from(header)
    .toString('latin1')
    .split(/\r?\n/)
    .filter((line) => line !== '');
  const kept = fieldsOf(lines).filter((field) => !isTraceHeader(fieldName(field)));
  const text = kept.map((field) => field.join('\r\n')).join('\r\n');
  return Buffer.from(text === '' ? '\r\n' : `${text}\r\n\r\n`, 'latin1');
};
