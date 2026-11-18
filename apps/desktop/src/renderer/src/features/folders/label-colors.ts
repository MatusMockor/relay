import type { Label } from '@relay/shared';

export const LABEL_HUES: readonly string[] = [
  '#a68cf5',
  '#3cc6c0',
  '#a3cf5a',
  '#ef6b6b',
  '#e6d15a',
  '#d77ae8',
  '#9aa4b8',
  '#b8b06a',
];

const byId = (labels: readonly Label[]): readonly Label[] =>
  [...labels].sort((a, b) => a.id.localeCompare(b.id));

export const labelHue = (labels: readonly Label[], id: string): string => {
  const index = byId(labels).findIndex((label) => label.id === id);
  return LABEL_HUES[Math.max(index, 0) % LABEL_HUES.length] ?? 'var(--accent)';
};
