import type { Plugin } from 'vite';

export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "connect-src 'self' http: https: ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'self' blob:",
  "form-action 'none'",
  "worker-src 'self'",
].join('; ');

export const rendererCspPlugin = (): Plugin => ({
  name: 'relay:renderer-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: RENDERER_CSP },
      injectTo: 'head-prepend',
    },
  ],
});
