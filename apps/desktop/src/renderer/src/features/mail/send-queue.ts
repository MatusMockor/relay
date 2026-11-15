export interface PendingSend {
  cancel(): boolean;
}

type Commit = () => Promise<void>;

export class DeferredQueue {
  private readonly pending = new Map<
    number,
    { readonly timer: ReturnType<typeof setTimeout>; readonly commit: Commit }
  >();
  private sequence = 0;

  enqueue(delayMs: number, commit: Commit): PendingSend {
    this.sequence += 1;
    const id = this.sequence;
    const timer = setTimeout(() => {
      this.pending.delete(id);
      void commit();
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
    });
    await Promise.all(entries.map((entry) => entry.commit()));
  }
}

export const sendQueue = new DeferredQueue();
