export class SingleFlight<Key, Result> {
  private readonly flights = new Map<Key, Promise<Result>>();

  run(key: Key, work: () => Promise<Result>): Promise<Result> {
    const existing = this.flights.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const flight = work().finally(() => {
      this.flights.delete(key);
    });
    this.flights.set(key, flight);
    return flight;
  }
}
