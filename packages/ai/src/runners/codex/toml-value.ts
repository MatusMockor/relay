export function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(', ')}]`;
}

export function tomlInlineTable(entries: Readonly<Record<string, string>>): string {
  const pairs = Object.entries(entries).map(
    ([key, value]) => `${tomlString(key)} = ${tomlString(value)}`,
  );
  return `{ ${pairs.join(', ')} }`;
}
