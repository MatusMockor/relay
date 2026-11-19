import type { AttachmentMeta } from '@relay/shared';
import { Icon, Sheet } from '@relay/ui';
import { useState } from 'react';
import { nameOf } from '../attachment-kind';
import { useAttachmentLoader } from '../use-attachment-loader';
import { AttachmentBlobCache } from './attachment-blob-cache';
import { AttachmentPreview } from './AttachmentPreview';
import { usePreviewKeys } from './use-preview-keys';
import { useViewerActions } from './use-viewer-actions';
import { ViewerHeader } from './ViewerHeader';
import { ViewerStrip } from './ViewerStrip';

export interface AttachmentViewerProps {
  readonly attachments: readonly AttachmentMeta[];
  readonly initialIndex: number;
  readonly onClose: () => void;
}

const STEP_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

export function AttachmentViewer({ attachments, initialIndex, onClose }: AttachmentViewerProps) {
  const loader = useAttachmentLoader();
  const [cache] = useState(() => new AttachmentBlobCache(loader));
  const actions = useViewerActions(cache.load);
  const [index, setIndex] = useState(initialIndex);
  const count = attachments.length;
  const current = Math.min(index, count - 1);
  const attachment = attachments[current];
  const step = (delta: number) => {
    setIndex((value) => (Math.min(value, count - 1) + delta + count) % count);
  };
  const stepByKey = (key: string): boolean => {
    const delta = STEP_KEYS[key];
    if (delta === undefined || count < 2) {
      return false;
    }
    step(delta);
    return true;
  };
  usePreviewKeys((key) => {
    if (key === 'Escape') {
      onClose();
      return;
    }
    stepByKey(key);
  });
  if (attachment === undefined) {
    return null;
  }
  const onKey = (event: KeyboardEvent): boolean => {
    if (!stepByKey(event.key)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  return (
    <Sheet
      label={`Náhľad prílohy ${nameOf(attachment)}`}
      className="att-viewer"
      onClose={onClose}
      onKey={onKey}
    >
      <ViewerHeader
        attachment={attachment}
        position={current + 1}
        count={count}
        actions={actions}
        onClose={onClose}
      />
      <div className="av-body">
        <AttachmentPreview
          key={attachment.id}
          attachment={attachment}
          load={cache.load}
          actions={actions}
        />
        {count < 2 ? null : (
          <>
            <button
              type="button"
              className="av-nav prev"
              aria-label="Predchádzajúca príloha"
              onClick={() => {
                step(-1);
              }}
            >
              <Icon name="back" />
            </button>
            <button
              type="button"
              className="av-nav next"
              aria-label="Ďalšia príloha"
              onClick={() => {
                step(1);
              }}
            >
              <Icon name="forward" />
            </button>
          </>
        )}
      </div>
      {count < 2 ? null : (
        <ViewerStrip attachments={attachments} current={current} onPick={setIndex} />
      )}
    </Sheet>
  );
}
