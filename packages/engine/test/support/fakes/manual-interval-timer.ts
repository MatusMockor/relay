import type { IntervalTask, IntervalTimer } from '../../../src';

interface Repeating {
  readonly intervalMs: number;
  readonly task: IntervalTask;
}

export class ManualIntervalTimer implements IntervalTimer {
  private readonly repeating = new Set<Repeating>();

  repeat(intervalMs: number, task: IntervalTask): () => void {
    const entry = { intervalMs, task };
    this.repeating.add(entry);
    return () => {
      this.repeating.delete(entry);
    };
  }

  get intervals(): number[] {
    return [...this.repeating].map((entry) => entry.intervalMs);
  }

  async fire(): Promise<void> {
    await Promise.all([...this.repeating].map((entry) => entry.task()));
  }
}
