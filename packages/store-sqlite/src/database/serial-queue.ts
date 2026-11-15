export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<Result>(task: () => Promise<Result> | Result): Promise<Result> {
    const next = this.tail.then(task);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
