import { describe, expect, it } from 'vitest';
import { RENDERER_CSP } from '../../renderer-csp';
import { buildMailDocument, mailCsp } from '../../src/renderer/src/features/thread/html-mail';

const sourcesOf = (policy: string, directive: string): string[] => {
  const entry = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return entry === undefined ? [] : entry.slice(1);
};

const effectiveImageSources = (mailPolicy: string): string[] => {
  const renderer = sourcesOf(RENDERER_CSP, 'img-src');
  return sourcesOf(mailPolicy, 'img-src').filter((source) => renderer.includes(source));
};

describe('remote images in the Electron renderer', () => {
  it('lets the renderer policy load remote images while scripts stay local', () => {
    expect(sourcesOf(RENDERER_CSP, 'img-src')).toEqual(["'self'", 'data:', 'https:', 'http:']);
    expect(sourcesOf(RENDERER_CSP, 'script-src')).toEqual(["'self'"]);
    expect(sourcesOf(RENDERER_CSP, 'object-src')).toEqual(["'none'"]);
  });

  it('blocks remote images in the mail iframe until the user allows them', () => {
    expect(effectiveImageSources(mailCsp(false))).toEqual(['data:']);
    expect(effectiveImageSources(mailCsp(true))).toEqual(['data:', 'https:', 'http:']);
    expect(sourcesOf(mailCsp(true), 'script-src')).toEqual(["'none'"]);
  });

  it('embeds the stricter mail policy into the sandboxed document', () => {
    const document = buildMailDocument('<img src="https://cdn.example.com/a.png">', false);
    expect(document).toContain('http-equiv="Content-Security-Policy"');
    expect(document).toContain('img-src data: cid:;');
  });
});
