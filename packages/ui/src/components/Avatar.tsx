import { clsx } from 'clsx';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  readonly name: string;
  readonly seed?: string;
  readonly size?: AvatarSize;
}

const PALETTE_SIZE = 7;

export const initialsOf = (name: string): string => {
  const words = name
    .replace(/[<>"]/g, '')
    .split(/[\s@._-]+/)
    .filter((word) => word.length > 0);
  const letters = words.length > 1 ? [words[0], words[1]] : [words[0] ?? '?'];
  return letters
    .map((word) => (word ?? '?').charAt(0))
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('sk');
};

export const colorIndexOf = (seed: string): number => {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % PALETTE_SIZE) + 1;
};

export function Avatar({ name, seed, size = 'md' }: AvatarProps) {
  const color = `c${String(colorIndexOf(seed ?? name))}`;
  return (
    <span className={clsx('av', color, size !== 'md' && size)} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
