import type { AttachmentMeta } from '@relay/shared';
import { useEffect, useState } from 'react';
import { describeError } from '../../../data/errors';
import { readBlobBytes } from '../../../lib/read-blob';
import type { BlobLoader } from '../use-blob-action';
import { decodeText } from './decode-text';

export type PreviewContent =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'url'; readonly url: string }
  | { readonly status: 'text'; readonly text: string };

export interface PreviewContentState {
  readonly content: PreviewContent;
  readonly retry: () => void;
}

const LOADING: PreviewContent = { status: 'loading' };
const TEXT_TYPE = 'text/plain';

export const usePreviewContent = (
  attachment: AttachmentMeta,
  type: string,
  load: BlobLoader,
): PreviewContentState => {
  const [target] = useState(attachment);
  const [content, setContent] = useState<PreviewContent>(LOADING);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    const show = (next: PreviewContent) => {
      if (!active) {
        return;
      }
      setContent(next);
    };
    setContent(LOADING);
    load(target)
      .then(readBlobBytes)
      .then((bytes) => {
        if (type === TEXT_TYPE) {
          show({ status: 'text', text: decodeText(bytes, target.contentType) });
          return;
        }
        if (!active) {
          return;
        }
        url = URL.createObjectURL(new Blob([bytes], { type }));
        show({ status: 'url', url });
      })
      .catch((error: unknown) => {
        show({ status: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [target, type, load, attempt]);
  return {
    content,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
};
