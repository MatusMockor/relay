import { type AttachmentMeta, canOpenAttachmentExternally } from '@relay/shared';
import { useAppContext } from '../../../data/hooks/services-context';
import type { AttachmentOpener } from '../../../platform/attachment-opener';
import { nameOf } from '../attachment-kind';
import { type BlobActionState, type BlobLoader, useBlobAction } from '../use-blob-action';

export interface ViewerActions {
  readonly save: BlobActionState;
  readonly open: BlobActionState | null;
  readonly quickLook: BlobActionState | null;
}

const unavailable = (): Promise<void> => Promise.resolve();

const quickLookOf = (opener: AttachmentOpener | null) =>
  opener?.quickLook === true ? opener.showQuickLook : null;

export const useViewerActions = (load: BlobLoader): ViewerActions => {
  const { platform } = useAppContext();
  const opener = platform.attachmentOpener;
  const showQuickLook = quickLookOf(opener);
  const save = useBlobAction(
    load,
    (blob, name) => {
      platform.saveFile(blob, name);
    },
    'stiahnuť',
  );
  const open = useBlobAction(load, opener?.open ?? unavailable, 'otvoriť');
  const quickLook = useBlobAction(load, showQuickLook ?? unavailable, 'otvoriť');
  return {
    save,
    open: opener === null ? null : open,
    quickLook: showQuickLook === null ? null : quickLook,
  };
};

export const openActionFor = (
  actions: ViewerActions,
  attachment: AttachmentMeta,
): BlobActionState | null =>
  canOpenAttachmentExternally(nameOf(attachment)) ? actions.open : null;
