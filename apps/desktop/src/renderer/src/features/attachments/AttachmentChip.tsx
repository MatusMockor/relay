import type { AttachmentMeta } from '@relay/shared';
import { cx, Icon, TooltipButton } from '@relay/ui';
import type { MouseEvent } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { nameOf, previewKindOf } from './attachment-kind';
import { formatSize } from './format-size';
import { TypeBadge } from './TypeBadge';
import { useAttachmentLoader } from './use-attachment-loader';
import { useBlobAction } from './use-blob-action';

export interface AttachmentChipProps {
  readonly attachment: AttachmentMeta;
  readonly onPreview: () => void;
}

const noQuickLook = (): Promise<void> => Promise.resolve();

const statusOf = (attachment: AttachmentMeta, saving: boolean, opening: boolean): string => {
  if (saving) {
    return 'Sťahujem…';
  }
  if (opening) {
    return 'Otváram…';
  }
  return formatSize(attachment.size);
};

export function AttachmentChip({ attachment, onPreview }: AttachmentChipProps) {
  const { platform } = useAppContext();
  const load = useAttachmentLoader();
  const opener = platform.attachmentOpener;
  const save = useBlobAction(
    load,
    (blob, name) => {
      platform.saveFile(blob, name);
    },
    'stiahnuť',
  );
  const quickLook = useBlobAction(load, opener?.showQuickLook ?? noQuickLook, 'otvoriť');
  const usesQuickLook = opener?.quickLook === true && previewKindOf(attachment) === 'file';
  const name = nameOf(attachment);
  const busy = save.busy || quickLook.busy;
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    if (usesQuickLook) {
      quickLook.run(attachment);
      return;
    }
    onPreview();
  };
  return (
    <div className={cx('att', busy && 'busy')}>
      <button
        type="button"
        className="att-open"
        aria-label={`Zobraziť náhľad ${name}`}
        disabled={quickLook.busy}
        onClick={open}
      >
        <TypeBadge attachment={attachment} />
        <span className="n">{name}</span>
        <span className="z">{statusOf(attachment, save.busy, quickLook.busy)}</span>
      </button>
      <TooltipButton
        tip="Stiahnuť"
        className="att-dl"
        aria-label={`Stiahnuť ${name}`}
        disabled={save.busy}
        onClick={() => {
          save.run(attachment);
        }}
      >
        <Icon name={save.busy ? 'spinner' : 'download'} size={14} strokeWidth={1.7} />
      </TooltipButton>
    </div>
  );
}
