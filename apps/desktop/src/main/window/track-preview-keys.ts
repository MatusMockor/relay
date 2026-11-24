import { type PreviewKey, PreviewKeySchema } from '@relay/shared/ipc';
import { isPdfViewerUrl } from './pdf-viewer-frame';

export interface FocusedFrame {
  readonly url: string;
  readonly parent: FocusedFrame | null;
}

export interface KeyInput {
  readonly type: string;
  readonly key: string;
  readonly shift: boolean;
  readonly control: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export interface PreviewKeySource {
  readonly focusedFrame: FocusedFrame | null;
  on(
    event: 'before-input-event',
    listener: (event: { preventDefault(): void }, input: KeyInput) => void,
  ): unknown;
}

const isPreviewDocument = (url: string): boolean => url.startsWith('blob:') || isPdfViewerUrl(url);

const insidePreviewFrame = (frame: FocusedFrame | null): boolean => {
  if (frame === null || frame.parent === null) {
    return false;
  }
  return isPreviewDocument(frame.url) || insidePreviewFrame(frame.parent);
};

const previewKeyOf = (input: KeyInput): PreviewKey | null => {
  const parsed = PreviewKeySchema.safeParse(input.key);
  const modified = input.shift || input.control || input.alt || input.meta;
  if (input.type !== 'keyDown' || modified || !parsed.success) {
    return null;
  }
  return parsed.data;
};

export const trackPreviewKeys = (
  contents: PreviewKeySource,
  publish: (key: PreviewKey) => void,
): void => {
  contents.on('before-input-event', (event, input) => {
    const key = previewKeyOf(input);
    if (key === null || !insidePreviewFrame(contents.focusedFrame)) {
      return;
    }
    event.preventDefault();
    publish(key);
  });
};
