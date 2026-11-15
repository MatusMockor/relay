export interface PendingSend {
  cancel(): boolean;
}

type Commit = () => Promise<void>;

export class DeferredQueue {
  private readonly pending = new Map<
    number,
    { readonly timer: ReturnType<typeof setTimeout>; readonly commit: Commit }
  >();
  private readonly inFlight = new Set<Promise<void>>();
  private sequence = 0;

  enqueue(delayMs: number, commit: Commit): PendingSend {
    this.sequence += 1;
    const id = this.sequence;
    const timer = setTimeout(() => {
      this.pending.delete(id);
      this.track(commit);
    }, delayMs);
    this.pending.set(id, { timer, commit });
    return {
      cancel: () => {
        const entry = this.pending.get(id);
        if (entry === undefined) {
          return false;
        }
        clearTimeout(entry.timer);
        this.pending.delete(id);
        return true;
      },
    };
  }

  async flushAll(): Promise<void> {
    const entries = [...this.pending.values()];
    this.pending.clear();
    entries.forEach((entry) => {
      clearTimeout(entry.timer);
      this.track(entry.commit);
    });
    await Promise.all([...this.inFlight]);
  }

  private track(commit: Commit): void {
    const run = Promise.resolve()
      .then(commit)
      .catch(() => undefined)
      .finally(() => {
        this.inFlight.delete(run);
      });
    this.inFlight.add(run);
  }
}

export const sendQueue = new DeferredQueue();
