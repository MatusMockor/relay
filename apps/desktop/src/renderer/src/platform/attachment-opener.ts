export interface AttachmentOpener {
  readonly quickLook: boolean;
  readonly open: (blob: Blob, filename: string) => Promise<void>;
  readonly showQuickLook: (blob: Blob, filename: string) => Promise<void>;
}
