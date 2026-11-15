export interface AttachmentUpload {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export interface AttachmentContent {
  readonly filename: string | null;
  readonly contentType: string;
  readonly content: Uint8Array;
}
