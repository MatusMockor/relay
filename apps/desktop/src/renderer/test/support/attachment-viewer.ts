import type { AttachmentMeta, PreviewKey } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createBrowserPlatform } from '../../src/platform/BrowserPlatform';
import type { AttachmentOpener } from '../../src/platform/attachment-opener';
import type { Platform } from '../../src/platform/Platform';
import type { ContractServer, HandlerResult } from './contract-server';
import { tokens } from './fixtures';
import { storageWith } from './render-app';
import { serverDetail, serverThread } from './thread-fixtures';

export interface SavedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface OpenedFile extends SavedFile {
  readonly action: 'open' | 'quickLook';
}

export const SUBJECT = 'Faktúra za november';

export const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
export const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
export const TXT = new TextEncoder().encode('Poznámky k faktúre');
export const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const meta = (id: string, filename: string, contentType: string, size: number): AttachmentMeta =>
  ({ id, filename, contentType, size, contentId: null, inline: false }) as AttachmentMeta;

export const ATTACHMENTS = [
  meta('att-pdf', 'faktura-11.pdf', 'application/pdf', 48_640),
  meta('att-jpg', 'foto.jpg', 'image/jpeg', 2_048),
  meta('att-txt', 'poznamky.txt', 'text/plain', 20),
  meta('att-docx', 'zmluva.docx', 'application/octet-stream', 9_000),
];

const CONTENT: Readonly<Record<string, readonly [string, Uint8Array]>> = {
  'att-pdf': ['application/pdf', PDF],
  'att-jpg': ['image/jpeg', JPG],
  'att-txt': ['text/plain', TXT],
  'att-docx': ['application/octet-stream', DOCX],
};

export const readBlob = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.readAsArrayBuffer(blob);
  });

export interface ObjectUrls {
  readonly live: Map<string, Blob>;
  readonly created: string[];
}

export const installObjectUrls = (): ObjectUrls => {
  const urls: ObjectUrls = { live: new Map(), created: [] };
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:relay-test/${String(urls.created.length + 1)}`;
    urls.created.push(url);
    urls.live.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    urls.live.delete(url);
  };
  return urls;
};

export const serveAttachments = (
  server: ContractServer,
  attachments: readonly AttachmentMeta[] = ATTACHMENTS,
  override: (id: string) => HandlerResult | null = () => null,
): void => {
  const thread = serverThread(SUBJECT);
  server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
  server.handle('threads.get', () => ({ body: serverDetail(thread, attachments) }));
  server.handle('attachments.content', (_request, params) => {
    const id = params.id ?? '';
    const custom = override(id);
    if (custom !== null) {
      return custom;
    }
    const [contentType, bytes] = CONTENT[id] ?? ['application/octet-stream', new Uint8Array()];
    return { body: null, raw: { contentType, bytes } };
  });
};

export interface PlatformRecords {
  readonly saved: Promise<SavedFile>[];
  readonly opened: Promise<OpenedFile>[];
}

export const recordingOpener = (opened: Promise<OpenedFile>[]): AttachmentOpener => ({
  quickLook: true,
  open: (blob, name) => {
    opened.push(readBlob(blob).then((bytes) => ({ action: 'open', name, bytes })));
    return Promise.resolve();
  },
  showQuickLook: (blob, name) => {
    opened.push(readBlob(blob).then((bytes) => ({ action: 'quickLook', name, bytes })));
    return Promise.resolve();
  },
});

export const syncedPlatform = async (
  server: ContractServer,
  records: PlatformRecords,
  attachmentOpener: AttachmentOpener | null = null,
): Promise<Platform> => {
  const base = createBrowserPlatform(
    storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
  );
  await base.tokenStore(server.url).save(tokens('access-1'));
  return {
    ...base,
    attachmentOpener,
    saveFile: (blob, name) => {
      records.saved.push(readBlob(blob).then((bytes) => ({ name, bytes })));
    },
  };
};

export const openThread = async (): Promise<HTMLElement> => {
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  const row = within(list)
    .getAllByRole('option')
    .find((item) => item.textContent.includes(SUBJECT));
  act(() => {
    fireEvent.click(row ?? document.body);
  });
  return screen.findByRole('list', { name: 'Prílohy' });
};

export const clickChip = (attachments: HTMLElement, name: string): HTMLElement => {
  const chip = within(attachments).getByRole('button', { name: `Zobraziť náhľad ${name}` });
  act(() => {
    chip.focus();
    fireEvent.click(chip);
  });
  return chip;
};

export const contentRequests = (server: ContractServer, id: string): number =>
  server.requests.filter((request) => request.url === `/attachments/${id}/content`).length;

export const viewerMeta = (dialog: HTMLElement): string =>
  dialog.querySelector('.av-meta')?.textContent ?? '';

export const expectViewerOf = async (name: string): Promise<HTMLElement> => {
  const dialog = await screen.findByRole('dialog', { name: `Náhľad prílohy ${name}` });
  expect(within(dialog).getByRole('heading', { name })).toBeDefined();
  return dialog;
};

export interface PreviewKeyFeed {
  readonly listeners: Set<(key: PreviewKey) => void>;
  readonly subscribe: (listener: (key: PreviewKey) => void) => () => void;
  readonly press: (key: PreviewKey) => void;
}

export const previewKeyFeed = (): PreviewKeyFeed => {
  const listeners = new Set<(key: PreviewKey) => void>();
  return {
    listeners,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    press: (key) => {
      act(() => {
        listeners.forEach((listener) => {
          listener(key);
        });
      });
    },
  };
};
