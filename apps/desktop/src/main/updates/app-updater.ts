export interface AvailableUpdate {
  readonly version: string;
}

export type UpdaterFailureListener = (error: Error) => void;

export interface AppUpdater {
  check(): Promise<AvailableUpdate | null>;
  download(onProgress: (percent: number) => void): Promise<void>;
  install(): Promise<void>;
  onFailure(listener: UpdaterFailureListener): void;
}
