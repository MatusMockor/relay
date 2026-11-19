import type { AttachmentMeta } from '@relay/shared';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { showToast } from '../../state/toast-store';
import { nameOf } from './attachment-kind';

export type BlobLoader = (attachment: AttachmentMeta) => Promise<Blob>;
export type BlobAction = (blob: Blob, name: string) => void | Promise<void>;

export interface BlobActionState {
  readonly busy: boolean;
  readonly run: (attachment: AttachmentMeta) => void;
}

export const useBlobAction = (
  load: BlobLoader,
  act: BlobAction,
  failure: string,
): BlobActionState => {
  const [busy, setBusy] = useState(false);
  const run = (attachment: AttachmentMeta) => {
    const name = nameOf(attachment);
    setBusy(true);
    load(attachment)
      .then((blob) => act(blob, name))
      .catch((error: unknown) => {
        showToast(`Prílohu ${name} sa nepodarilo ${failure}: ${describeError(error)}`);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, run };
};
