const endsWithSoftBreak = (line: string): boolean => / $/.test(line) && !/(^|\n)-- $/.test(line);

const joinSoftBreak = (line: string, next: string, delSp: boolean): string =>
  delSp ? `${line.slice(0, -1)}${next}` : `${line}${next}`;

export const decodeFlowed = (text: string, delSp: boolean): string => {
  const result: string[] = [];
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (current !== null && endsWithSoftBreak(current)) {
      current = joinSoftBreak(current, line, delSp);
      continue;
    }
    if (current !== null) {
      result.push(current);
    }
    current = line;
  }
  if (current !== null && current !== '') {
    result.push(current);
  }
  return result.join('\n').replace(/^ /gm, '');
};
