import { Icon } from '@relay/ui';
import { useRef, useState } from 'react';
import { buildMailDocument, hasRemoteImages } from './html-mail';

export function HtmlMailFrame({ html, title }: { readonly html: string; readonly title: string }) {
  const [allowRemote, setAllowRemote] = useState(false);
  const [height, setHeight] = useState(160);
  const ref = useRef<HTMLIFrameElement>(null);
  const remote = hasRemoteImages(html);
  const measure = () => {
    const body = ref.current?.contentDocument?.body;
    if (body === undefined) {
      return;
    }
    setHeight(Math.max(80, body.scrollHeight + 4));
  };
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
        onLoad={measure}
      />
    </div>
  );
}
