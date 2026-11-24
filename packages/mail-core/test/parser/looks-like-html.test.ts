import { describe, expect, it } from 'vitest';
import { looksLikeHtml } from '../../src/parser/looks-like-html';

describe('looksLikeHtml', () => {
  it.each([
    ['a doctype', '<!DOCTYPE html>\n<html><body>Ahoj</body></html>'],
    ['a lowercase doctype after whitespace', '  \n<!doctype html><p>Ahoj</p>'],
    ['an html root', '<html>\n<body><p>Ahoj</p></body>\n</html>'],
    ['an html root with attributes', '<html lang="sk"><body>Ahoj</body></html>'],
    [
      'Outlook markup with namespaces',
      '<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head></head><body>Ahoj</body></html>',
    ],
    [
      'an xml declaration before the root',
      '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">\n<html>',
    ],
    ['a comment before the root', '<!-- generated -->\n<html><body>Ahoj</body></html>'],
    ['an html root without head or body', '<html><title>Stav</title><p>Odoslané</p></html>'],
    ['a fragment with block tags', '<div><p>Zásielka je na ceste</p></div>'],
    ['a table layout', '<table><tr><td>Ahoj</td></tr></table>'],
    ['a head without a root', '<head><style>p{}</style></head><body>Ahoj</body>'],
  ])('recognizes %s', (_label, text) => {
    expect(looksLikeHtml(text)).toBe(true);
  });

  it.each([
    ['plain text', 'Dobrý deň,\nposielam faktúru za október.'],
    ['text mentioning a bold tag', 'Použi tag <b> na tučné písmo, napr. <b>text</b>.'],
    ['a comparison', 'Ak a < b a zároveň b > c, potom platí...'],
    ['an address in angle brackets', 'Jan <jan@x.sk> napísal:\n> pôvodná správa'],
    ['text starting with an address', '<jan@x.sk> poslal novú ponuku'],
    ['text starting with a link', '<https://relay.test/a> pozri prosím'],
    ['an inline tag at the start', '<b>Dôležité</b>: zajtra o 10:00'],
    ['a block tag that is never closed', '<p> je tag pre odstavec, používame ho často'],
    ['markup followed by prose', '<div>Example</div>\nPaste this into the template'],
    ['prose about the html tag', '<html> is the root element. Paste it into your template.'],
    ['prose about the body tag', '<html> is the root element. The <body tag goes inside it.'],
    ['an unterminated comment', '<!-- poznámka bez konca <html><body>Ahoj</body>'],
    ['an empty string', ''],
  ])('keeps %s as plain text', (_label, text) => {
    expect(looksLikeHtml(text)).toBe(false);
  });

  it('stays fast on many leading comments before a fragment', () => {
    const text = `${'<!-- x -->'.repeat(5000)}<div>Ahoj</div> a potom text`;
    const started = performance.now();

    expect(looksLikeHtml(text)).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
