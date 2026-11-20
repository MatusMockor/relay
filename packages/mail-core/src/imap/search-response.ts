export const MAX_EXPANDED_UIDS = 100_000;

const valueOf = (attribute: unknown): string | null => {
  if (typeof attribute !== 'object' || attribute === null) {
    return null;
  }
  const value: unknown = Reflect.get(attribute, 'value');
  return typeof value === 'string' ? value : null;
};

const attributesOf = (untagged: unknown): unknown[] => {
  if (typeof untagged !== 'object' || untagged === null) {
    return [];
  }
  const attributes: unknown = Reflect.get(untagged, 'attributes');
  return Array.isArray(attributes) ? attributes : [];
};

const uidOf = (value: string | null): number | null => {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) {
    return null;
  }
  return Number(value);
};

const rangeOf = (part: string): readonly [number, number] | null => {
  const [from = '', to = from] = part.split(':');
  const low = uidOf(from);
  const high = uidOf(to);
  if (low === null || high === null) {
    return null;
  }
  return [Math.min(low, high), Math.max(low, high)];
};

const newestOf = (range: readonly [number, number], budget: number): number[] => {
  const start = Math.max(range[0], range[1] - budget + 1);
  return Array.from({ length: Math.max(0, range[1] - start + 1) }, (_, index) => start + index);
};

const expand = (set: string, budget: number): number[] =>
  set
    .split(',')
    .reverse()
    .reduce<number[]>((taken, part) => {
      const range = rangeOf(part);
      const left = budget - taken.length;
      if (range === null || left <= 0) {
        return taken;
      }
      return [...newestOf(range, left), ...taken];
    }, []);

const esearchAll = (attributes: readonly unknown[], budget: number): number[] => {
  const index = attributes.findIndex((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL');
  const set = index === -1 ? null : valueOf(attributes[index + 1]);
  return set === null ? [] : expand(set, budget);
};

export const searchResultUids = (untagged: unknown, budget = MAX_EXPANDED_UIDS): number[] => {
  if (budget <= 0) {
    return [];
  }
  const attributes = attributesOf(untagged);
  if (attributes.some((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL')) {
    return esearchAll(attributes, budget);
  }
  const uids = attributes.map(valueOf).flatMap((value) => {
    const uid = uidOf(value);
    return uid === null ? [] : [uid];
  });
  return uids.slice(Math.max(0, uids.length - budget));
};
