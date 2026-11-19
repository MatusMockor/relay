// @vitest-environment jsdom
import type { AttachmentMeta } from '@relay/shared';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeText } from '../src/features/attachments/viewer/decode-text';
import {
  clickChip,
  expectViewerOf,
  installObjectUrls,
  openThread,
  serveAttachments,
  syncedPlatform,
} from './support/attachment-viewer';
import { type ContractServer, startContractServer } from './support/contract-server';
import { renderApp, resetStores } from './support/render-app';

const CAFE_LATIN1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
const CAFE_UTF8 = new TextEncoder().encode('café');

const textFile = (id: string, filename: string, contentType: string): AttachmentMeta =>
  ({ id, filename, contentType, size: 5, contentId: null, inline: false }) as AttachmentMeta;

describe('plain text attachment preview', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    installObjectUrls();
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const previewText = async (contentType: string, bytes: Uint8Array): Promise<string> => {
    serveAttachments(server, [textFile('att-txt', 'menu.txt', contentType)], () => ({
      body: null,
      raw: { contentType: 'text/plain', bytes },
    }));
    renderApp({ platform: await syncedPlatform(server, { saved: [], opened: [] }) });
    clickChip(await openThread(), 'menu.txt');
    const dialog = await expectViewerOf('menu.txt');
    return (await within(dialog).findByLabelText('Obsah súboru menu.txt')).textContent;
  };

  it('decodes the text with the charset the mail declared', async () => {
    expect(await previewText('text/plain; charset=iso-8859-1', CAFE_LATIN1)).toBe('café');
  });

  it('keeps UTF-8 text intact', async () => {
    expect(await previewText('text/plain; charset="UTF-8"', CAFE_UTF8)).toBe('café');
  });

  it('falls back to UTF-8 for a missing or unknown charset', () => {
    expect(decodeText(CAFE_UTF8, 'text/plain')).toBe('café');
    expect(decodeText(CAFE_UTF8, 'text/plain; charset=x-made-up')).toBe('café');
  });
});
