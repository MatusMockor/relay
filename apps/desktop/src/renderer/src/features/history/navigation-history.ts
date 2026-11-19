export type HistoryDirection = 'back' | 'forward';

export const HISTORY_LIMIT = 50;

export class NavigationHistory<Entry> {
  private entries: readonly Entry[] = [];
  private index = -1;

  constructor(private readonly limit = HISTORY_LIMIT) {}

  reset(entry: Entry): void {
    this.entries = [entry];
    this.index = 0;
  }

  current(): Entry | null {
    return this.entries[this.index] ?? null;
  }

  visit(entry: Entry): void {
    this.entries = [...this.entries.slice(0, this.index + 1), entry].slice(-(this.limit + 1));
    this.index = this.entries.length - 1;
  }

  replaceCurrent(entry: Entry): void {
    this.entries = this.entries.map((item, position) => (position === this.index ? entry : item));
  }

  can(direction: HistoryDirection): boolean {
    return direction === 'back' ? this.index > 0 : this.index < this.entries.length - 1;
  }

  move(direction: HistoryDirection): Entry | null {
    if (!this.can(direction)) {
      return null;
    }
    this.index += direction === 'back' ? -1 : 1;
    return this.current();
  }

  rewrite(update: (entry: Entry) => Entry, same: (a: Entry, b: Entry) => boolean): void {
    const kept: Entry[] = [];
    let index = -1;
    this.entries.forEach((original, position) => {
      const entry = update(original);
      const previous = kept.at(-1);
      if (entry === original || previous === undefined || !same(previous, entry)) {
        kept.push(entry);
      }
      if (position === this.index) {
        index = kept.length - 1;
      }
    });
    this.entries = kept;
    this.index = index;
  }
}
