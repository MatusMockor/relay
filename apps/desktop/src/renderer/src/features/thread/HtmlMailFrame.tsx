import { Icon } from '@relay/ui';
import { useRef, useState } from 'react';
import { buildMailDocument, hasRemoteImages } from './html-mail';
import { useFrameHeight } from './use-frame-height';
import { useFrameHistoryInputs } from './use-frame-history-inputs';

export function HtmlMailFrame({ html, title }: { readonly html: string; readonly title: string }) {
  const [allowRemote, setAllowRemote] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  const { height, onLoad } = useFrameHeight(ref);
  const listenForHistory = useFrameHistoryInputs(ref);
  const remote = hasRemoteImages(html);
  return (
    <div className="html-mail">
      {remote && !allowRemote ? (
        <div className="img-note" role="note">
          <Icon name="image" />
          <span>
            Obrázky z internetu sú zablokované, aby odosielateľ nevidel, že si mail otvoril.
          </span>
          <button
            type="button"
            onClick={() => {
              setAllowRemote(true);
            }}
          >
            Zobraziť obrázky
          </button>
        </div>
      ) : null}
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={buildMailDocument(html, allowRemote)}
        style={{ height }}
        onLoad={() => {
          onLoad();
          listenForHistory();
        }}
      />
    </div>
  );
}
