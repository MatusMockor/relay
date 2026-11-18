// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { withBlockedImagePlaceholders } from '../src/features/thread/blocked-images';
import { buildMailDocument } from '../src/features/thread/html-mail';

const imagesOf = (html: string): HTMLImageElement[] => [
  ...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img'),
];

const svgOf = (html: string): string => {
  const match = /src="data:image\/svg\+xml,([^"]*)"/.exec(html);
  expect(match).not.toBeNull();
  return decodeURIComponent(match?.[1] ?? '');
};

describe('blocked remote images', () => {
  it('swaps a remote image for an empty spacer of the same size', () => {
    const html = withBlockedImagePlaceholders(
      '<img src="https://cdn.example.com/banner.png" alt="Banner" width="560" height="120">',
    );

    expect(html).not.toContain('cdn.example.com');
    expect(html).toContain('alt="Banner"');
    expect(html).toContain('data-relay-blocked=""');
    expect(svgOf(html)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="560" height="120"/>');
  });

  it('drops a remote srcset and hides an image without a known size', () => {
    const html = withBlockedImagePlaceholders(
      "<img src='//cdn.example.com/a.png' srcset='https://cdn.example.com/a@2x.png 2x' width='150' style='display:block!important'>",
    );
    const [image] = imagesOf(html);

    expect(html).not.toContain('cdn.example.com');
    expect(image?.getAttribute('data-relay-blocked')).toBe('hidden');
    expect(image?.getAttribute('style')).toBe('display:none!important');
  });

  it('keeps inline and attached images untouched', () => {
    const inline = '<img src="cid:logo@mail" alt="Logo">';

    expect(withBlockedImagePlaceholders(inline)).toBe(inline);
  });

  it('reads the real src after an alt that contains a closing bracket', () => {
    const html = withBlockedImagePlaceholders(
      '<img alt="A > B" src="https://cdn.example.com/a.png" width="40" height="40">',
    );
    const [image] = imagesOf(html);

    expect(html).not.toContain('cdn.example.com');
    expect(image?.getAttribute('alt')).toBe('A > B');
    expect(image?.hasAttribute('data-relay-blocked')).toBe(true);
  });

  it('leaves text that looks like a src inside another attribute intact', () => {
    const html = withBlockedImagePlaceholders(
      '<img title="src=https://cdn.example.com/x.png" src="https://cdn.example.com/a.png">',
    );
    const [image] = imagesOf(html);

    expect(image?.getAttribute('title')).toBe('src=https://cdn.example.com/x.png');
    expect(image?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
  });

  it('keeps a CID fallback and drops the remote srcset candidates', () => {
    const html = withBlockedImagePlaceholders(
      '<img src="cid:logo@mail" srcset="https://cdn.example.com/logo@2x.png 2x, cid:logo2x@mail 3x">',
    );
    const [image] = imagesOf(html);

    expect(html).not.toContain('cdn.example.com');
    expect(image?.getAttribute('src')).toBe('cid:logo@mail');
    expect(image?.getAttribute('srcset')).toBe('cid:logo2x@mail 3x');
    expect(image?.hasAttribute('data-relay-blocked')).toBe(false);
  });

  it('gives an image with only a remote srcset a placeholder', () => {
    const html = withBlockedImagePlaceholders(
      '<img srcset="https://cdn.example.com/a.png 1x, https://cdn.example.com/a@2x.png 2x">',
    );
    const [image] = imagesOf(html);

    expect(html).not.toContain('cdn.example.com');
    expect(image?.hasAttribute('srcset')).toBe(false);
    expect(image?.hasAttribute('data-relay-blocked')).toBe(true);
  });

  it('removes remote picture sources so the placeholder fallback renders', () => {
    const html = withBlockedImagePlaceholders(
      [
        '<picture>',
        '<source media="(min-width: 600px)" srcset="https://cdn.example.com/wide.png">',
        '<source srcset="https://cdn.example.com/b.webp 1x, cid:b@mail 2x" type="image/webp">',
        '<img src="https://cdn.example.com/b.png" alt="Banner">',
        '</picture>',
      ].join(''),
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(html).not.toContain('cdn.example.com');
    expect([...parsed.querySelectorAll('source')].map((source) => source.srcset)).toEqual([
      'cid:b@mail 2x',
    ]);
    expect(parsed.querySelector('img')?.hasAttribute('data-relay-blocked')).toBe(true);
  });

  it('shows the original images once remote images are allowed', () => {
    const html = '<img src="https://cdn.example.com/a.png">';

    expect(buildMailDocument(html, true)).toContain('https://cdn.example.com/a.png');
    expect(buildMailDocument(html, false)).not.toContain('https://cdn.example.com/a.png');
  });

  it('keeps an unsized image visible when it still has a permitted candidate', () => {
    const fromSrcset = imagesOf(
      withBlockedImagePlaceholders(
        '<img src="https://cdn.example.com/a.png" srcset="data:image/png;base64,AA 1x">',
      ),
    );
    const fromPicture = imagesOf(
      withBlockedImagePlaceholders(
        '<picture><source srcset="data:image/png;base64,AA"><img src="https://cdn.example.com/b.png"></picture>',
      ),
    );

    expect([...fromSrcset, ...fromPicture].map((image) => image.getAttribute('style'))).toEqual([
      null,
      null,
    ]);
    expect(
      [...fromSrcset, ...fromPicture].map((image) => image.getAttribute('data-relay-blocked')),
    ).toEqual(['', '']);
  });
});
