import type { AttachmentMeta } from '@relay/shared';
import { cx } from '@relay/ui';
import { nameOf } from '../attachment-kind';
import { TypeBadge } from '../TypeBadge';

export interface ViewerStripProps {
  readonly attachments: readonly AttachmentMeta[];
  readonly current: number;
  readonly onPick: (index: number) => void;
}

export function ViewerStrip({ attachments, current, onPick }: ViewerStripProps) {
  return (
    <nav className="av-strip" aria-label="Prílohy správy">
      {attachments.map((attachment, index) => (
        <button
          key={attachment.id}
          type="button"
          className={cx('av-thumb', index === current && 'on')}
          aria-current={index === current ? 'true' : undefined}
          onClick={() => {
            onPick(index);
          }}
        >
          <TypeBadge attachment={attachment} />
          <span className="n">{nameOf(attachment)}</span>
        </button>
      ))}
    </nav>
  );
}
