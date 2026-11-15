import { describe, expect, it } from 'vitest';
import type { UrlOpener } from '../../src/main/platform/url-opener';
import {
  type FrameNavigation,
  type LinkRoutingContents,
  routeExternalLinks,
} from '../../src/main/window/route-external-links';

class RecordingBrowser implements UrlOpener {
  readonly opened: string[] = [];

  open(url: string): Promise<void> {
    this.opened.push(url);
    return Promise.resolve();
  }
}

class FakeWebContents implements LinkRoutingContents {
  private openHandler: (details: { readonly url: string }) => { action: 'deny' } = () => ({
    action: 'deny',
  });
  private navigate: (navigation: FrameNavigation) => void = () => undefined;

  setWindowOpenHandler(handler: (details: { readonly url: string }) => { action: 'deny' }): void {
    this.openHandler = handler;
  }

  on(_event: 'will-frame-navigate', listener: (navigation: FrameNavigation) => void): this {
    this.navigate = listener;
    return this;
  }

  windowOpen(url: string): string {
    return this.openHandler({ url }).action;
  }

  frameNavigate(url: string, isMainFrame: boolean): boolean {
    let prevented = false;
    this.navigate({
      url,
      isMainFrame,
      preventDefault: () => {
        prevented = true;
      },
    });
    return prevented;
  }
}

const setup = () => {
  const contents = new FakeWebContents();
  const browser = new RecordingBrowser();
  routeExternalLinks(contents, browser);
  return { contents, browser };
};

describe('external links from the renderer', () => {
  it('opens window.open and target=_blank links in the system browser and never in the app', () => {
    const { contents, browser } = setup();
    expect(contents.windowOpen('https://example.com/a')).toBe('deny');
    expect(contents.windowOpen('http://intranet.local/b')).toBe('deny');
    expect(contents.windowOpen('mailto:jana@example.com')).toBe('deny');
    expect(browser.opened).toEqual([
      'https://example.com/a',
      'http://intranet.local/b',
      'mailto:jana@example.com',
    ]);
  });

  it('drops links with other protocols', () => {
    const { contents, browser } = setup();
    ['file:///etc/passwd', 'javascript:alert(1)', 'smb://share/x', 'not a url'].forEach((url) => {
      expect(contents.windowOpen(url)).toBe('deny');
    });
    expect(browser.opened).toEqual([]);
  });

  it('blocks navigations of the app window and of mail frames and opens them externally', () => {
    const { contents, browser } = setup();
    expect(contents.frameNavigate('https://evil.example.com/', true)).toBe(true);
    expect(contents.frameNavigate('https://news.example.com/article', false)).toBe(true);
    expect(contents.frameNavigate('file:///etc/passwd', false)).toBe(true);
    expect(browser.opened).toEqual([
      'https://evil.example.com/',
      'https://news.example.com/article',
    ]);
  });

  it('lets the mail iframe load its own srcdoc document', () => {
    const { contents, browser } = setup();
    expect(contents.frameNavigate('about:srcdoc', false)).toBe(false);
    expect(contents.frameNavigate('about:blank', false)).toBe(false);
    expect(contents.frameNavigate('about:blank', true)).toBe(true);
    expect(browser.opened).toEqual([]);
  });
});
