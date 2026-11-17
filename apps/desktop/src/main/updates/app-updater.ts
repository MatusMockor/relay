export interface AvailableUpdate {
  readonly version: string;
}

export interface AppUpdater {
  check(): Promise<AvailableUpdate | null>;
  download(onProgress: (percent: number) => void): Promise<void>;
  install(): Promise<void>;
}
