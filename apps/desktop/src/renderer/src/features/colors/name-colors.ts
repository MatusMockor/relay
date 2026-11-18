export const ACCENT = '#8ea2ff';
export const ACCENT_STAND_IN = '#a98bf0';
export const NEUTRAL = '#7c8294';

export const NAME_HUES: readonly string[] = [
  '#e6d15a',
  '#ef6b6b',
  '#a3cf5a',
  '#5fc4d9',
  '#e0864a',
  '#d77ae8',
  '#9aa4b8',
  '#b8b06a',
];

export interface ColoredName {
  readonly name: string;
  readonly color: string;
}

export interface NamedLabel {
  readonly id: string;
  readonly name: string;
}

export interface NameColors {
  readonly of: (name: string) => string;
  readonly labelHues: ReadonlyMap<string, string>;
}

const keyOf = (name: string): string => name.trim().toLocaleLowerCase('sk');

export const accountHue = (color: string): string =>
  color.toLowerCase() === ACCENT ? ACCENT_STAND_IN : color;

const accountColorsOf = (accounts: readonly ColoredName[]): Map<string, string> => {
  const colors = new Map<string, string>();
  for (const account of accounts) {
    if (!colors.has(keyOf(account.name))) {
      colors.set(keyOf(account.name), accountHue(account.color));
    }
  }
  return colors;
};

const labelKeysOf = (labels: readonly NamedLabel[], colors: ReadonlyMap<string, string>) =>
  [...labels]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((label) => keyOf(label.name))
    .filter((key, index, keys) => !colors.has(key) && keys.indexOf(key) === index);

const assignLabelHues = (
  keys: readonly string[],
  palette: readonly string[],
  previous: ReadonlyMap<string, string>,
): Map<string, string> => {
  const kept = new Map(
    keys.flatMap((key) => {
      const hue = previous.get(key);
      return hue !== undefined && palette.includes(hue) ? [[key, hue] as const] : [];
    }),
  );
  const used = new Set(kept.values());
  const free = palette.filter((hue) => !used.has(hue));
  let overflow = 0;
  return new Map(
    keys.map((key) => {
      const hue = kept.get(key) ?? free.shift() ?? palette[overflow++ % palette.length];
      return [key, hue ?? NEUTRAL] as const;
    }),
  );
};

export const createNameColors = (
  accounts: readonly ColoredName[],
  labels: readonly NamedLabel[],
  previous: ReadonlyMap<string, string> = new Map(),
): NameColors => {
  const colors = accountColorsOf(accounts);
  const taken = new Set([...colors.values()].map((color) => color.toLowerCase()));
  const palette = NAME_HUES.filter((hue) => !taken.has(hue));
  const labelHues = assignLabelHues(labelKeysOf(labels, colors), palette, previous);
  const all = new Map([...colors, ...labelHues]);
  return { of: (name) => all.get(keyOf(name)) ?? NEUTRAL, labelHues };
};
