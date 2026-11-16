export class SingleFlightOAuth {
  private active: AbortController | null = null;
  private readonly running = new Set<Promise<unknown>>();

  run<Result>(work: (signal: AbortSignal) => Promise<Result>): Promise<Result> {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    const operation = work(controller.signal).finally(() => {
      if (this.active === controller) {
        this.active = null;
      }
    });
    const settled = operation
      .catch(() => undefined)
      .finally(() => {
        this.running.delete(settled);
      });
    this.running.add(settled);
    return operation;
  }

  cancel(): void {
    this.active?.abort();
    this.active = null;
  }

  async shutdown(): Promise<void> {
    this.cancel();
    await Promise.all(this.running);
  }
}
