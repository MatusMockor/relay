import { newestUids, type UidRange } from './newest-uids';

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

const rangeOf = (part: string): UidRange[] => {
  const [from = '', to = from] = part.split(':');
  const low = uidOf(from);
  const high = uidOf(to);
  if (low === null || high === null) {
    return [];
  }
  return [{ low: Math.min(low, high), high: Math.max(low, high) }];
};

const esearchAll = (attributes: readonly unknown[]): UidRange[] => {
  const index = attributes.findIndex((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL');
  const set = index === -1 ? null : valueOf(attributes[index + 1]);
  return set === null ? [] : set.split(',').flatMap(rangeOf);
};

const searchResultRanges = (untagged: unknown): UidRange[] => {
  const attributes = attributesOf(untagged);
  if (attributes.some((attribute) => valueOf(attribute)?.toUpperCase() === 'ALL')) {
    return esearchAll(attributes);
  }
  return attributes.map(valueOf).flatMap((value) => {
    const uid = uidOf(value);
    return uid === null ? [] : [{ low: uid, high: uid }];
  });
};

export const searchResponsesUids = (
  responses: readonly unknown[],
  budget = MAX_EXPANDED_UIDS,
): number[] => newestUids(responses.flatMap(searchResultRanges), budget);

export const searchResultUids = (untagged: unknown, budget = MAX_EXPANDED_UIDS): number[] =>
  searchResponsesUids([untagged], budget);
