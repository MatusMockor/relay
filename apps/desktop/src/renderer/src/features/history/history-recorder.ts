import type { HistoryDirection, NavigationHistory } from './navigation-history';

export interface LocationStore<Location> {
  read(): Location | null;
  write(location: Location): void;
  same(a: Location, b: Location): boolean;
  subscribe(listener: () => void): () => void;
}

export class HistoryRecorder<Location> {
  private current: Location | null = null;
  private applying = false;

  constructor(
    private readonly history: NavigationHistory<Location>,
    private readonly store: LocationStore<Location>,
  ) {}

  start(): () => void {
    this.history.clear();
    this.current = this.store.read();
    return this.store.subscribe(() => {
      this.observe();
    });
  }

  can(direction: HistoryDirection): boolean {
    return this.current !== null && this.history.can(direction);
  }

  go(direction: HistoryDirection, prepare: () => void = () => undefined): void {
    const before = this.current;
    if (before === null || !this.history.can(direction)) {
      return;
    }
    this.quietly(prepare);
    const target = this.history.take(direction, before);
    if (target === null || this.store.same(this.current ?? before, target)) {
      return;
    }
    this.quietly(() => {
      this.store.write(target);
    });
  }

  rewrite(update: (location: Location) => Location): void {
    this.history.map(update);
    const live = this.store.read();
    if (live === null || this.store.same(live, update(live))) {
      this.current = this.current === null ? null : update(this.current);
      return;
    }
    this.quietly(() => {
      this.store.write(update(live));
    });
  }

  quietly(run: () => void): void {
    this.applying = true;
    try {
      run();
    } finally {
      this.applying = false;
    }
    this.current = this.store.read() ?? this.current;
  }

  private observe(): void {
    if (this.applying) {
      return;
    }
    const next = this.store.read();
    if (next === null) {
      return;
    }
    const previous = this.current;
    this.current = next;
    if (previous === null || this.store.same(previous, next)) {
      return;
    }
    this.history.push(previous);
  }
}
