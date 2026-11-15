// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

interface SavedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const readBlob = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.readAsArrayBuffer(blob);
  });

const SUBJECT = 'Faktúra za november';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe('received attachments', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const syncedPlatform = async (saved: Promise<SavedFile>[]): Promise<Platform> => {
    const base = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await base.tokenStore(server.url).save(tokens('access-1'));
    return {
      ...base,
      saveFile: (blob, name) => {
        saved.push(readBlob(blob).then((bytes) => ({ name, bytes })));
      },
    };
  };

  it('lists file attachments under the message and downloads them from the server', async () => {
    const thread = serverThread(SUBJECT);
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({
      body: serverDetail(thread, [
        {
          id: 'att-1',
          filename: 'faktura-11.pdf',
          contentType: 'application/pdf',
          size: 48_640,
          contentId: null,
          inline: false,
        },
        {
          id: 'att-2',
          filename: 'logo.png',
          contentType: 'image/png',
          size: 900,
          contentId: 'logo@firma',
          inline: true,
        },
      ]),
    }));
    server.handle('attachments.content', () => ({
      body: null,
      raw: { contentType: 'application/pdf', bytes: PDF },
    }));
    const saved: Promise<SavedFile>[] = [];
    renderApp({ platform: await syncedPlatform(saved) });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    const row = within(list)
      .getAllByRole('option')
      .find((item) => item.textContent.includes(SUBJECT));
    act(() => {
      fireEvent.click(row ?? document.body);
    });
    const attachments = await screen.findByRole('list', { name: 'Prílohy' });
    expect(within(attachments).getAllByRole('button')).toHaveLength(1);
    const button = within(attachments).getByRole('button', { name: 'Stiahnuť faktura-11.pdf' });
    expect(button.textContent).toContain('48 kB');
    act(() => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(await saved[0]).toEqual({ name: 'faktura-11.pdf', bytes: PDF });
    expect(server.requests.find((request) => request.key === 'attachments.content')).toMatchObject({
      url: '/attachments/att-1/content',
      authorization: 'Bearer access-1',
    });
  });
});
