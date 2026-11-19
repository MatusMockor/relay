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
const DOBRY_DEN_1250 = new Uint8Array([0x44, 0x6f, 0x62, 0x72, 0xfd, 0x20, 0x64, 0x65, 0xf2]);
const UTF16LE_BOM = new Uint8Array([0xff, 0xfe, 0x63, 0x00, 0x61, 0x00, 0x66, 0x00, 0xe9, 0x00]);
const UTF16BE_BOM = new Uint8Array([0xfe, 0xff, 0x00, 0x63, 0x00, 0x61, 0x00, 0x66, 0x00, 0xe9]);
const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf, ...CAFE_UTF8]);

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

  it('reads legacy Central European text from a stored attachment without a charset', async () => {
    expect(await previewText('text/plain', DOBRY_DEN_1250)).toBe('Dobrý deň');
  });

  it('follows a byte order mark first, even over a declared charset', () => {
    expect(decodeText(UTF16LE_BOM, 'text/plain')).toBe('café');
    expect(decodeText(UTF16BE_BOM, 'text/plain')).toBe('café');
    expect(decodeText(UTF8_BOM, 'text/plain')).toBe('café');
    expect(decodeText(UTF16LE_BOM, 'text/plain; charset=iso-8859-1')).toBe('café');
  });

  it('keeps valid UTF-8 and falls back to windows-1250 only when it is not UTF-8', () => {
    expect(decodeText(CAFE_UTF8, 'text/plain')).toBe('café');
    expect(decodeText(CAFE_LATIN1, 'text/plain')).toBe('café');
    expect(decodeText(DOBRY_DEN_1250, 'text/plain')).toBe('Dobrý deň');
    expect(decodeText(CAFE_UTF8, 'text/plain; charset=x-made-up')).toBe('café');
    expect(decodeText(CAFE_LATIN1, 'text/plain; charset=x-made-up')).toBe('café');
  });

  it('still respects a declared charset', () => {
    expect(decodeText(CAFE_LATIN1, 'text/plain; charset=iso-8859-1')).toBe('café');
    expect(decodeText(new Uint8Array([0xe8]), 'text/plain; charset=iso-8859-1')).toBe('è');
    expect(decodeText(new Uint8Array([0xe8]), 'text/plain')).toBe('č');
    expect(decodeText(new Uint8Array([0xa9]), 'text/plain; charset=iso-8859-2')).toBe('Š');
  });
});
