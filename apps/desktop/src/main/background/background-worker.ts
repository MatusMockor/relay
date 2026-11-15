export interface BackgroundWorker {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
