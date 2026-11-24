export interface LinkValue {
  readonly target: string;
  readonly rels: readonly string[];
}

interface Cursor {
  index: number;
}

const skipSpaces = (header: string, cursor: Cursor): void => {
  while (cursor.index < header.length && /\s/.test(header.charAt(cursor.index))) {
    cursor.index += 1;
  }
};

const readUntil = (header: string, cursor: Cursor, stops: string): string => {
  const start = cursor.index;
  while (cursor.index < header.length && !stops.includes(header.charAt(cursor.index))) {
    cursor.index += 1;
  }
  return header.slice(start, cursor.index);
};

const readQuoted = (header: string, cursor: Cursor): string => {
  cursor.index += 1;
  const value = readUntil(header, cursor, '"');
  cursor.index += 1;
  return value;
};

const readParams = (header: string, cursor: Cursor): string[] => {
  const rels: string[] = [];
  while (cursor.index < header.length && header.charAt(cursor.index) === ';') {
    cursor.index += 1;
    skipSpaces(header, cursor);
    const name = readUntil(header, cursor, '=;,').trim().toLowerCase();
    if (header.charAt(cursor.index) !== '=') {
      continue;
    }
    cursor.index += 1;
    skipSpaces(header, cursor);
    const value =
      header.charAt(cursor.index) === '"'
        ? readQuoted(header, cursor)
        : readUntil(header, cursor, ';,').trim();
    skipSpaces(header, cursor);
    if (name === 'rel') {
      rels.push(...value.toLowerCase().split(/\s+/).filter(Boolean));
    }
  }
  return rels;
};

const readValue = (header: string, cursor: Cursor): LinkValue | null => {
  skipSpaces(header, cursor);
  if (header.charAt(cursor.index) !== '<') {
    readUntil(header, cursor, ',');
    return null;
  }
  cursor.index += 1;
  const target = readUntil(header, cursor, '>');
  cursor.index += 1;
  skipSpaces(header, cursor);
  return { target, rels: readParams(header, cursor) };
};

export const parseLinkHeader = (header: string): LinkValue[] => {
  const links: LinkValue[] = [];
  const cursor: Cursor = { index: 0 };
  while (cursor.index < header.length) {
    const link = readValue(header, cursor);
    if (link !== null) {
      links.push(link);
    }
    readUntil(header, cursor, ',');
    cursor.index += 1;
  }
  return links;
};
