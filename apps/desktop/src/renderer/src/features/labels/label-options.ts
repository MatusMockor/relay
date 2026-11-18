import type { Label } from '@relay/shared';
import { fuzzyScore } from '../../lib/text';

export type LabelOption =
  | { readonly kind: 'label'; readonly label: Label }
  | { readonly kind: 'create'; readonly name: string };

const sameName = (left: string, right: string): boolean =>
  left.toLocaleLowerCase('sk') === right.toLocaleLowerCase('sk');

const byName = (left: Label, right: Label): number => left.name.localeCompare(right.name, 'sk');

const matching = (labels: readonly Label[], query: string): Label[] => {
  if (query === '') {
    return [...labels].sort(byName);
  }
  return labels
    .map((label) => ({ label, score: fuzzyScore(query, label.name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.label);
};

export const labelOptionsOf = (labels: readonly Label[], query: string): LabelOption[] => {
  const name = query.trim();
  const shown = matching(labels, name).map((label): LabelOption => ({ kind: 'label', label }));
  if (name === '' || labels.some((label) => sameName(label.name, name))) {
    return shown;
  }
  return [...shown, { kind: 'create', name }];
};

export const optionKey = (option: LabelOption): string =>
  option.kind === 'label' ? option.label.id : `create:${option.name}`;
