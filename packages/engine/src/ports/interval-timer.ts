export type IntervalTask = () => Promise<void>;

export interface IntervalTimer {
  repeat(intervalMs: number, task: IntervalTask): () => void;
}
