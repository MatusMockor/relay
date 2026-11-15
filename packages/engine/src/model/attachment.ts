export interface AttachmentUpload {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}
