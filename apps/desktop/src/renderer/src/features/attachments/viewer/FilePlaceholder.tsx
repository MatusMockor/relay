import type { AttachmentMeta } from '@relay/shared';
import { Button } from '@relay/ui';
import { nameOf } from '../attachment-kind';
import { formatSize } from '../format-size';
import { TypeBadge } from '../TypeBadge';
import { openActionFor, type ViewerActions } from './use-viewer-actions';

export interface FilePlaceholderProps {
  readonly attachment: AttachmentMeta;
  readonly actions: ViewerActions;
}

export function FilePlaceholder({ attachment, actions }: FilePlaceholderProps) {
  const { save, quickLook } = actions;
  const open = openActionFor(actions, attachment);
  return (
    <div className="av-file">
      <TypeBadge attachment={attachment} />
      <b>{nameOf(attachment)}</b>
      <span>{formatSize(attachment.size)}</span>
      <p>Pre tento typ súboru nie je náhľad v aplikácii dostupný.</p>
      <div className="av-file-btns">
        {quickLook === null ? null : (
          <Button
            disabled={quickLook.busy}
            onClick={() => {
              quickLook.run(attachment);
            }}
          >
            Rýchly náhľad
          </Button>
        )}
        {open === null ? null : (
          <Button
            disabled={open.busy}
            onClick={() => {
              open.run(attachment);
            }}
          >
            Otvoriť v aplikácii
          </Button>
        )}
        <Button
          variant="primary"
          disabled={save.busy}
          onClick={() => {
            save.run(attachment);
          }}
        >
          Stiahnuť
        </Button>
      </div>
    </div>
  );
}
