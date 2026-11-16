export const foldText = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const truncate = (value: string, max: number): string => {
  if (max <= 0) {
    return '';
  }
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

export const plural = (count: number, one: string, few: string, many: string): string => {
  if (count === 1) {
    return one;
  }
  return count >= 2 && count <= 4 ? few : many;
};

export const accountCount = (count: number): string =>
  `${String(count)} ${plural(count, 'účet', 'účty', 'účtov')}`;

export const capitalize = (value: string): string =>
  value.charAt(0).toLocaleUpperCase('sk') + value.slice(1);

export const firstName = (name: string | null | undefined): string =>
  (name ?? '').split(' ')[0] ?? '';

export const fuzzyScore = (query: string, text: string): number => {
  const needle = foldText(query).trim();
  if (needle === '') {
    return 1;
  }
  const hay = foldText(text);
  const at = hay.indexOf(needle);
  if (at >= 0) {
    return 100 - Math.min(at, 40) + (at === 0 || hay[at - 1] === ' ' ? 30 : 0);
  }
  const words = needle.split(/\s+/);
  if (words.length > 1 && words.every((word) => hay.includes(word))) {
    return 45;
  }
  let qi = 0;
  let prev = -1;
  let gaps = 0;
  for (let hi = 0; hi < hay.length && qi < needle.length; hi += 1) {
    if (hay[hi] !== needle[qi]) {
      continue;
    }
    gaps += prev >= 0 ? hi - prev - 1 : 0;
    prev = hi;
    qi += 1;
  }
  return qi < needle.length ? 0 : Math.max(1, 30 - gaps);
};
