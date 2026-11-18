export interface ParsedCommand {
  readonly tag: string;
  readonly name: string;
  readonly args: string[];
}

const TOKEN = /"((?:[^"\\]|\\.)*)"|\(([^()]*)\)|\[[^\]]*\]|(\S+)/g;

export const tokenize = (line: string): string[] =>
  [...line.matchAll(TOKEN)].map((match) => match[1] ?? match[0]);

export const parseCommand = (line: string): ParsedCommand => {
  const [tag = '*', first = '', ...rest] = tokenize(line);
  const name = first.toUpperCase();
  if (name !== 'UID') {
    return { tag, name, args: rest };
  }
  const [sub = '', ...args] = rest;
  return { tag, name: `UID ${sub.toUpperCase()}`, args };
};

export const quote = (value: string): string => `"${value.replace(/(["\\])/g, '\\$1')}"`;

const rangeOf = (part: string, max: number): number[] => {
  const [from = '', to = from] = part.split(':');
  const start = from === '*' ? max : Number(from);
  const end = to === '*' ? max : Number(to);
  const [low, high] = start <= end ? [start, end] : [end, start];
  return Array.from({ length: Math.max(0, high - low + 1) }, (_, index) => low + index);
};

export const uidSet = (set: string, existing: readonly number[]): number[] => {
  const max = Math.max(0, ...existing);
  const wanted = new Set(set.split(',').flatMap((part) => rangeOf(part, max)));
  return existing.filter((uid) => wanted.has(uid));
};
