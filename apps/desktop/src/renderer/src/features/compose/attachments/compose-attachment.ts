import type { DraftAttachment } from '@relay/shared';

export type ComposeAttachment =
  | { readonly key: string; readonly kind: 'ready'; readonly attachment: DraftAttachment }
  | {
      readonly key: string;
      readonly kind: 'uploading' | 'failed';
      readonly filename: string;
      readonly size: number;
      readonly error?: string;
    };

let sequence = 0;

export const nextAttachmentKey = (): string => {
  sequence += 1;
  return `upload-${String(sequence)}`;
};

export const readyOf = (attachment: DraftAttachment): ComposeAttachment => ({
  key: attachment.id,
  kind: 'ready',
  attachment,
});

export const sizeOf = (item: ComposeAttachment): number =>
  item.kind === 'ready' ? item.attachment.size : item.size;

export const nameOf = (item: ComposeAttachment): string =>
  item.kind === 'ready' ? item.attachment.filename : item.filename;

export const readyAttachments = (items: readonly ComposeAttachment[]): DraftAttachment[] =>
  items.flatMap((item) => (item.kind === 'ready' ? [item.attachment] : []));

export const usage = (items: readonly ComposeAttachment[]) => {
  const counted = items.filter((item) => item.kind !== 'failed');
  return { bytes: counted.reduce((sum, item) => sum + sizeOf(item), 0), count: counted.length };
};
