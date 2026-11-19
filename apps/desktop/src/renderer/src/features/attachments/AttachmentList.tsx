import type { AttachmentMeta } from '@relay/shared';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AttachmentChip } from './AttachmentChip';
import { AttachmentViewer } from './viewer/AttachmentViewer';

export function AttachmentList({
  attachments,
}: {
  readonly attachments: readonly AttachmentMeta[];
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const files = attachments.filter((attachment) => !attachment.inline);
  if (files.length === 0) {
    return null;
  }
  return (
    <>
      <ul className="atts" aria-label="Prílohy">
        {files.map((attachment, index) => (
          <li key={attachment.id}>
            <AttachmentChip
              attachment={attachment}
              onPreview={() => {
                setViewing(index);
              }}
            />
          </li>
        ))}
      </ul>
      {viewing === null
        ? null
        : createPortal(
            <AttachmentViewer
              attachments={files}
              initialIndex={viewing}
              onClose={() => {
                setViewing(null);
              }}
            />,
            document.body,
          )}
    </>
  );
}
