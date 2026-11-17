import { describe, expect, it } from 'vitest';
import { withBlockedImagePlaceholders } from '../src/features/thread/blocked-images';
import { buildMailDocument } from '../src/features/thread/html-mail';

const svgOf = (html: string): string => {
  const match = /src="data:image\/svg\+xml,([^"]*)"/.exec(html);
  expect(match).not.toBeNull();
  return decodeURIComponent(match?.[1] ?? '');
};

describe('blocked remote images', () => {
  it('swaps a remote image for a neutral placeholder of the same size', () => {
    const html = withBlockedImagePlaceholders(
      '<img src="https://cdn.example.com/banner.png" alt="Banner" width="560" height="120">',
    );

    expect(html).not.toContain('cdn.example.com');
    expect(html).toContain('alt="Banner"');
    expect(html).toContain('data-relay-blocked=""');
    expect(svgOf(html)).toContain('width="560" height="120"');
  });

  it('drops a remote srcset and falls back to a default size', () => {
    const html = withBlockedImagePlaceholders(
      "<img src='//cdn.example.com/a.png' srcset='https://cdn.example.com/a@2x.png 2x'>",
    );

    expect(html).not.toContain('cdn.example.com');
    expect(svgOf(html)).toContain('width="320" height="80"');
  });

  it('keeps inline and attached images untouched', () => {
    const inline = '<img src="cid:logo@mail" alt="Logo">';

    expect(withBlockedImagePlaceholders(inline)).toBe(inline);
  });

  it('shows the original images once remote images are allowed', () => {
    const html = '<img src="https://cdn.example.com/a.png">';

    expect(buildMailDocument(html, true)).toContain('https://cdn.example.com/a.png');
    expect(buildMailDocument(html, false)).not.toContain('https://cdn.example.com/a.png');
  });
});
