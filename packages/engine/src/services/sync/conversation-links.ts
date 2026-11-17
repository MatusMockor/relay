import { normalizeSubject } from '../../subjects/normalize-subject';
import { subjectFallbackWindow } from '../../subjects/subject-fallback';
import { DisjointSet } from './disjoint-set';
import type { WindowEntry } from './initial-window';

export interface ConversationLinks {
  readonly set: DisjointSet;
  readonly parents: readonly (readonly number[])[];
}

const indexBy = (keys: readonly (readonly string[])[]): Map<string, number[]> => {
  const index = new Map<string, number[]>();
  keys.forEach((entryKeys, position) => {
    entryKeys.forEach((key) => {
      const positions = index.get(key);
      if (positions === undefined) {
        index.set(key, [position]);
        return;
      }
      positions.push(position);
    });
  });
  return index;
};

const ownIds = (entry: WindowEntry): string[] =>
  entry.messageId === null ? [] : [entry.messageId];

const idParents = (entries: readonly WindowEntry[]): number[][] => {
  const byMessageId = indexBy(entries.map(ownIds));
  return entries.map((entry, position) => [
    ...new Set(
      entry.parentIds
        .flatMap((id) => byMessageId.get(id) ?? [])
        .filter((parent) => parent !== position),
    ),
  ]);
};

const joinById = (entries: readonly WindowEntry[]): DisjointSet => {
  const set = new DisjointSet(entries.length);
  const ids = entries.map((entry) => [...ownIds(entry), ...entry.parentIds]);
  indexBy(ids).forEach((positions) => {
    positions.slice(1).forEach((position) => {
      set.join(position, positions[0] ?? position);
    });
  });
  return set;
};

const sentAt = (entries: readonly WindowEntry[], position: number): number =>
  Date.parse(entries[position]?.sentAt ?? '');

const before = (entries: readonly WindowEntry[], left: number, right: number): number =>
  sentAt(entries, left) - sentAt(entries, right) ||
  (entries[left]?.arrivedAt ?? 0) - (entries[right]?.arrivedAt ?? 0) ||
  left - right;

const subjectParent = (
  entries: readonly WindowEntry[],
  bySubject: ReadonlyMap<string, number[]>,
  position: number,
): number | null => {
  const entry = entries[position];
  const window =
    entry === undefined
      ? null
      : subjectFallbackWindow({
          subject: entry.subject,
          date: entry.sentAt,
          hasReplyHeaders: entry.parentIds.length > 0,
        });
  if (window === null) {
    return null;
  }
  const since = window.since.getTime();
  const candidates = (bySubject.get(window.normalizedSubject) ?? []).filter(
    (candidate) => sentAt(entries, candidate) >= since && before(entries, candidate, position) < 0,
  );
  return candidates.reduce<number | null>(
    (best, candidate) => (best === null || before(entries, candidate, best) > 0 ? candidate : best),
    null,
  );
};

export const conversationLinks = (entries: readonly WindowEntry[]): ConversationLinks => {
  const parents = idParents(entries);
  const set = joinById(entries);
  const bySubject = indexBy(entries.map((entry) => [normalizeSubject(entry.subject).value]));
  const roots = entries.flatMap((_, position) =>
    (parents[position]?.length ?? 0) === 0 ? [position] : [],
  );
  roots.forEach((position) => {
    const parent = subjectParent(entries, bySubject, position);
    if (parent === null) {
      return;
    }
    parents[position]?.push(parent);
    set.join(position, parent);
  });
  return { set, parents };
};
