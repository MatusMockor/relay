import type { AttachmentMeta } from '@relay/shared';
import { Button } from '@relay/ui';
import { nameOf, previewTypeOf } from '../attachment-kind';
import type { BlobLoader } from '../use-blob-action';
import { FilePlaceholder } from './FilePlaceholder';
import type { ViewerActions } from './use-viewer-actions';
import { usePreviewContent } from './use-preview-content';

interface ContentProps {
  readonly attachment: AttachmentMeta;
  readonly type: string;
  readonly load: BlobLoader;
}

function PreviewContent({ attachment, type, load }: ContentProps) {
  const { content, retry } = usePreviewContent(attachment, type, load);
  const name = nameOf(attachment);
  if (content.status === 'loading') {
    return (
      <div className="av-state" role="status">
        Načítavam náhľad…
      </div>
    );
  }
  if (content.status === 'error') {
    return (
      <div className="av-state" role="alert">
        <p>{`Náhľad prílohy sa nepodarilo načítať: ${content.message}`}</p>
        <Button onClick={retry}>Skúsiť znova</Button>
      </div>
    );
  }
  if (content.status === 'text') {
    return (
      <pre className="av-text" tabIndex={0} aria-label={`Obsah súboru ${name}`}>
        {content.text}
      </pre>
    );
  }
  if (type === 'application/pdf') {
    return (
      <iframe className="av-pdf" src={`${content.url}#toolbar=0`} title={`Dokument ${name}`} />
    );
  }
  return <img className="av-img" src={content.url} alt={name} />;
}

export interface AttachmentPreviewProps {
  readonly attachment: AttachmentMeta;
  readonly load: BlobLoader;
  readonly actions: ViewerActions;
}

export function AttachmentPreview({ attachment, load, actions }: AttachmentPreviewProps) {
  const type = previewTypeOf(attachment);
  if (type === null) {
    return <FilePlaceholder attachment={attachment} actions={actions} />;
  }
  return <PreviewContent attachment={attachment} type={type} load={load} />;
}
