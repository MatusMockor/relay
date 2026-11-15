import { createHash } from 'node:crypto';

export const canonicalServerUrl = (serverUrl: string): string =>
  new URL(serverUrl).href.replace(/\/+$/, '');

export const sessionSecretKey = (serverUrl: string): string =>
  `session:${createHash('sha256').update(canonicalServerUrl(serverUrl)).digest('hex')}`;
