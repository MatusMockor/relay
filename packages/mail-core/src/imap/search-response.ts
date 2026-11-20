const MAX_EXPANDED_UIDS = 100_000;

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

const expand = (set: string): number[] =>
  set.split(',').flatMap((part) => {
    const [from = '', to = from] = part.split(':');
    const low = uidOf(from);
    const high = uidOf(to);
    if (low === null || high === null) {
      return [];
    }
    const start = Math.max(Math.min(low, high), Math.max(low, high) - MAX_EXPANDED_UIDS + 1);
    return Array.from({ length: Math.max(low, high) - start + 1 }, (_, index) => start + index);
  });

const esearchAll = (attributes: readonly unknown[]): number[] => {
  const index = attributes.findIndex((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL');
  const set = index === -1 ? null : valueOf(attributes[index + 1]);
  return set === null ? [] : expand(set);
};

export const searchResultUids = (untagged: unknown): number[] => {
  const attributes = attributesOf(untagged);
  if (attributes.some((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL')) {
    return esearchAll(attributes);
  }
  return attributes.map(valueOf).flatMap((value) => {
    const uid = uidOf(value);
    return uid === null ? [] : [uid];
  });
};
