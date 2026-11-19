export interface FileQuarantine {
  mark(path: string): Promise<void>;
}
