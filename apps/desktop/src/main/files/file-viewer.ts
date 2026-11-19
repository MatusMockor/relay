export interface FileViewer {
  open(path: string): Promise<void>;
  quickLook(path: string, displayName: string): Promise<void>;
}
