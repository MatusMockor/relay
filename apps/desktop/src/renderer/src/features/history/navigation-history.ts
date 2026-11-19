export type HistoryDirection = 'back' | 'forward';

export const HISTORY_LIMIT = 50;

export class NavigationHistory<Location> {
  private back: Location[] = [];
  private forward: Location[] = [];

  constructor(private readonly limit = HISTORY_LIMIT) {}

  push(previous: Location): void {
    this.back = [...this.back, previous].slice(-this.limit);
    this.forward = [];
  }

  can(direction: HistoryDirection): boolean {
    return this.stack(direction).length > 0;
  }

  take(direction: HistoryDirection, current: Location): Location | null {
    const target = this.stack(direction).pop();
    if (target === undefined) {
      return null;
    }
    this.stack(direction === 'back' ? 'forward' : 'back').push(current);
    return target;
  }

  map(update: (location: Location) => Location): void {
    this.back = this.back.map(update);
    this.forward = this.forward.map(update);
  }

  clear(): void {
    this.back = [];
    this.forward = [];
  }

  private stack(direction: HistoryDirection): Location[] {
    return direction === 'back' ? this.back : this.forward;
  }
}
