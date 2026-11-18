import { conversationLinks } from './conversation-links';
import type { MailboxWindow, WindowEntry } from './initial-window';

interface Positioned {
  readonly entry: WindowEntry;
  readonly mailbox: number;
}

type Compare = (left: number, right: number) => number;

const byPosition =
  (items: readonly Positioned[]): Compare =>
  (left, right) => {
    const a = items[left];
    const b = items[right];
    if (a === undefined || b === undefined) {
      return left - right;
    }
    return (
      a.entry.arrivedAt - b.entry.arrivedAt ||
      a.mailbox - b.mailbox ||
      a.entry.uid - b.entry.uid ||
      left - right
    );
  };

const parentsFirst = (
  members: readonly number[],
  parents: readonly (readonly number[])[],
  compare: Compare,
): number[] => {
  const remaining = new Set(members);
  const ordered: number[] = [];
  while (remaining.size > 0) {
    const pending = [...remaining];
    const ready = pending.filter((member) =>
      (parents[member] ?? []).every((parent) => !remaining.has(parent)),
    );
    const next = (ready.length > 0 ? ready : pending).sort(compare)[0];
    if (next === undefined) {
      return ordered;
    }
    remaining.delete(next);
    ordered.push(next);
  }
  return ordered;
};

const groupsOf = (items: readonly Positioned[]): number[][] => {
  const { set, parents } = conversationLinks(items.map((item) => item.entry));
  const members = new Map<number, number[]>();
  items.forEach((_, index) => {
    const root = set.root(index);
    const group = members.get(root);
    if (group === undefined) {
      members.set(root, [index]);
      return;
    }
    group.push(index);
  });
  const compare = byPosition(items);
  const newest = (group: readonly number[]): number =>
    group.reduce((best, index) => (compare(index, best) > 0 ? index : best));
  return [...members.values()]
    .sort((left, right) => compare(newest(right), newest(left)))
    .map((group) => parentsFirst(group, parents, compare));
};

export const orderEntries = (groups: readonly (readonly WindowEntry[])[]): WindowEntry[] => {
  const items = groups.flatMap((entries, mailbox) => entries.map((entry) => ({ entry, mailbox })));
  return groupsOf(items).flatMap((group) =>
    group.flatMap((index) => {
      const item = items[index];
      return item === undefined ? [] : [item.entry];
    }),
  );
};

export const conversationOrder = (windows: readonly MailboxWindow[]): WindowEntry[] =>
  orderEntries(windows.map((window) => window.entries));
