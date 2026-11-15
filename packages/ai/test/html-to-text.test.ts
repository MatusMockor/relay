import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { htmlToText } from '../src/prompts/html-to-text';

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe('htmlToText', () => {
  it('drops scripts, styles and the head and turns block ends into line breaks', () => {
    const html =
      '<html><head><title>x</title></head><style>p{}</style><p>Dobrý deň</p><script>alert(1)</script><div>Faktúra<br/>v prílohe</div>';

    expect(htmlToText(html)).toBe('Dobrý deň\nFaktúra\nv prílohe');
  });

  it('keeps the text after an opening tag that is never closed', () => {
    expect(htmlToText('<p>Ahoj</p><script>zvyšok')).toBe('Ahoj\nzvyšok');
    expect(htmlToText('a <> b')).toBe('a <> b');
    expect(htmlToText('3 < 5')).toBe('3 < 5');
  });

  it('decodes decimal, hexadecimal and named character references after removing tags', () => {
    expect(
      htmlToText('<p>Pay &#8364;100 &#x20AC;5 &amp; &lt;b&gt; &quot;ok&quot; &#39;s&apos;</p>'),
    ).toBe('Pay €100 €5 & <b> "ok" \'s\'');
    expect(htmlToText('&#0; &#xD800; &#1114112; &unknown; &#x1F600;')).toBe('� � � &unknown; 😀');
  });

  it('converts malformed HTML from a hostile sender in linear time', () => {
    const unclosedBlocks = '<script'.repeat(40_000);
    const unclosedTags = '<a'.repeat(100_000);

    expect(elapsedMs(() => htmlToText(unclosedBlocks))).toBeLessThan(300);
    expect(elapsedMs(() => htmlToText(unclosedTags))).toBeLessThan(300);
  });
});
