import type { HistoryDirection, NavigationHistory } from './navigation-history';

export interface LocationStore<Location> {
  read(): Location;
  write(location: Location): void;
  same(a: Location, b: Location): boolean;
  paused(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface HistoryEntry<Location> {
  readonly location: Location;
  readonly tag: symbol | null;
}

export class HistoryRecorder<Location> {
  private applying = false;

  constructor(
    private readonly history: NavigationHistory<HistoryEntry<Location>>,
    private readonly store: LocationStore<Location>,
  ) {}

  start(): () => void {
    this.history.reset({ location: this.store.read(), tag: null });
    return this.store.subscribe(() => {
      this.observe();
    });
  }

  can(direction: HistoryDirection): boolean {
    return this.history.can(direction);
  }

  go(direction: HistoryDirection, prepare: () => void = () => undefined): void {
    if (!this.history.can(direction)) {
      return;
    }
    this.silently(prepare);
    const target = this.history.move(direction);
    if (target === null || this.store.same(this.store.read(), target.location)) {
      return;
    }
    this.quietly(() => {
      this.store.write(target.location);
    });
  }

  visit(apply: () => void, tag: symbol | null = null): void {
    this.silently(apply);
    const location = this.store.read();
    const current = this.history.current();
    if (current !== null && tag === null && this.store.same(current.location, location)) {
      this.history.replaceCurrent({ location, tag: current.tag });
      return;
    }
    this.history.visit({ location, tag });
  }

  rewrite(update: (location: Location, tag: symbol | null) => Location): void {
    const before = this.history.current();
    this.history.rewrite(
      (entry) => {
        const location = update(entry.location, entry.tag);
        return location === entry.location ? entry : { location, tag: entry.tag };
      },
      (a, b) => this.store.same(a.location, b.location),
    );
    const after = this.history.current();
    if (before === null || after === null || this.store.same(before.location, after.location)) {
      return;
    }
    const write = () => {
      this.store.write(after.location);
    };
    if (this.store.paused()) {
      this.silently(write);
      return;
    }
    this.quietly(write);
  }

  quietly(run: () => void): void {
    this.silently(run);
    const current = this.history.current();
    if (current === null) {
      return;
    }
    this.history.replaceCurrent({ location: this.store.read(), tag: current.tag });
  }

  private silently(run: () => void): void {
    this.applying = true;
    try {
      run();
    } finally {
      this.applying = false;
    }
  }

  private observe(): void {
    if (this.applying || this.store.paused()) {
      return;
    }
    this.visit(() => undefined);
  }
}
