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
}

const keyOf = (name: string): string => name.trim().toLocaleLowerCase('sk');

export const accountHue = (color: string): string =>
  color.toLowerCase() === ACCENT ? ACCENT_STAND_IN : color;

export const createNameColors = (
  accounts: readonly ColoredName[],
  labels: readonly NamedLabel[],
): NameColors => {
  const colors = new Map<string, string>();
  for (const account of accounts) {
    if (!colors.has(keyOf(account.name))) {
      colors.set(keyOf(account.name), accountHue(account.color));
    }
  }
  const taken = new Set([...colors.values()].map((color) => color.toLowerCase()));
  const palette = NAME_HUES.filter((hue) => !taken.has(hue));
  const fresh = [...labels]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((label) => keyOf(label.name))
    .filter((key, index, keys) => !colors.has(key) && keys.indexOf(key) === index);
  fresh.forEach((key, index) => {
    colors.set(key, palette[index % palette.length] ?? NEUTRAL);
  });
  return { of: (name) => colors.get(keyOf(name)) ?? NEUTRAL };
};
