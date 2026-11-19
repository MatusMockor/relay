import type { AttachmentMeta } from '@relay/shared';
import { Button, Icon, IconButton } from '@relay/ui';
import { nameOf } from '../attachment-kind';
import { formatSize } from '../format-size';
import { TypeBadge } from '../TypeBadge';
import { openActionFor, type ViewerActions } from './use-viewer-actions';

export interface ViewerHeaderProps {
  readonly attachment: AttachmentMeta;
  readonly position: number;
  readonly count: number;
  readonly actions: ViewerActions;
  readonly onClose: () => void;
}

export function ViewerHeader({ attachment, position, count, actions, onClose }: ViewerHeaderProps) {
  const { save } = actions;
  const open = openActionFor(actions, attachment);
  return (
    <header className="av-head">
      <TypeBadge attachment={attachment} />
      <h2 className="av-title">{nameOf(attachment)}</h2>
      <span className="av-meta">
        {`${formatSize(attachment.size)} · ${String(position)} / ${String(count)}`}
      </span>
      <span className="av-gap" />
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
        <Icon name={save.busy ? 'spinner' : 'download'} size={13} strokeWidth={1.8} />
        {save.busy ? 'Sťahujem…' : 'Stiahnuť'}
      </Button>
      <IconButton label="Zavrieť" shortcut={['Esc']} onClick={onClose}>
        <Icon name="x" />
      </IconButton>
    </header>
  );
}
