import type { UrlOpener } from '../platform/url-opener';
import { isSafeExternalUrl } from './external-links';
import { isPdfViewerUrl } from './pdf-viewer-frame';

export interface FrameNavigation {
  readonly url: string;
  readonly isMainFrame: boolean;
  preventDefault(): void;
}

export interface LinkRoutingContents {
  setWindowOpenHandler(handler: (details: { readonly url: string }) => { action: 'deny' }): void;
  on(event: 'will-frame-navigate', listener: (navigation: FrameNavigation) => void): unknown;
}

const IN_APP_FRAME_PROTOCOLS = new Set(['about:', 'blob:']);

const staysInFrame = (url: string): boolean =>
  (URL.canParse(url) && IN_APP_FRAME_PROTOCOLS.has(new URL(url).protocol)) || isPdfViewerUrl(url);

export const routeExternalLinks = (
  contents: LinkRoutingContents,
  opener: UrlOpener,
  isAppUrl: (url: string) => boolean,
): void => {
  const openExternally = (url: string): void => {
    if (!isSafeExternalUrl(url)) {
      return;
    }
    opener.open(url).catch(() => undefined);
  };
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-frame-navigate', (navigation) => {
    if (!navigation.isMainFrame && staysInFrame(navigation.url)) {
      return;
    }
    if (navigation.isMainFrame && isAppUrl(navigation.url)) {
      return;
    }
    navigation.preventDefault();
    openExternally(navigation.url);
  });
};
