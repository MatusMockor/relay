import type { MailboxWindow, WindowEntry } from './initial-window';

interface Positioned {
  readonly entry: WindowEntry;
  readonly mailbox: number;
}

const ascending = (left: Positioned, right: Positioned): number =>
  left.entry.date - right.entry.date ||
  left.mailbox - right.mailbox ||
  left.entry.uid - right.entry.uid;

const newestFirst = (left: Positioned[], right: Positioned[]): number => {
  const leftNewest = left.at(-1);
  const rightNewest = right.at(-1);
  if (leftNewest === undefined || rightNewest === undefined) {
    return 0;
  }
  return ascending(rightNewest, leftNewest);
};

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  root(index: number): number {
    let current = index;
    while (this.parents[current] !== current) {
      const parent = this.parents[current] ?? current;
      this.parents[current] = this.parents[parent] ?? parent;
      current = parent;
    }
    return current;
  }

  join(left: number, right: number): void {
    this.parents[this.root(left)] = this.root(right);
  }
}

const groupsOf = (positioned: readonly Positioned[]): Positioned[][] => {
  const set = new DisjointSet(positioned.length);
  const owners = new Map<string, number>();
  positioned.forEach((item, index) => {
    item.entry.ids.forEach((id) => {
      const owner = owners.get(id);
      if (owner === undefined) {
        owners.set(id, index);
        return;
      }
      set.join(index, owner);
    });
  });
  const groups = new Map<number, Positioned[]>();
  positioned.forEach((item, index) => {
    const root = set.root(index);
    const group = groups.get(root);
    if (group === undefined) {
      groups.set(root, [item]);
      return;
    }
    group.push(item);
  });
  return [...groups.values()].map((group) => group.sort(ascending));
};

export const conversationOrder = (windows: readonly MailboxWindow[]): WindowEntry[] => {
  const positioned = windows.flatMap((window, mailbox) =>
    window.entries.map((entry) => ({ entry, mailbox })),
  );
  return groupsOf(positioned)
    .sort(newestFirst)
    .flatMap((group) => group.map((item) => item.entry));
};
