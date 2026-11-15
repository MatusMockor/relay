import { describe, expect, it } from 'vitest';
import { createTrustedSenderPredicate } from '../src/main/ipc/trusted-sender';

const rendererFile = 'file:///opt/Relay/resources/app.asar/out/renderer/index.html';

describe('createTrustedSenderPredicate', () => {
  it('trusts only the packaged renderer file when there is no dev server', () => {
    const isTrusted = createTrustedSenderPredicate(null, rendererFile);
    expect(isTrusted(rendererFile)).toBe(true);
    expect(isTrusted(`${rendererFile}#/inbox`)).toBe(true);
    expect(isTrusted('file:///tmp/evil.html')).toBe(false);
    expect(isTrusted('http://127.0.0.1:5173/')).toBe(false);
    expect(isTrusted('')).toBe(false);
  });

  it('trusts the dev server origin during development', () => {
    const isTrusted = createTrustedSenderPredicate('http://127.0.0.1:5173', rendererFile);
    expect(isTrusted('http://127.0.0.1:5173/index.html')).toBe(true);
    expect(isTrusted('http://127.0.0.1:5174/')).toBe(false);
    expect(isTrusted('https://evil.example.com/')).toBe(false);
  });
});
