import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, relative } from 'node:path';
import { ProviderError } from '@relay/engine';
import { MAX_OPENED_ATTACHMENT_BYTES } from '@relay/shared/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { AttachmentLauncher } from '../../src/main/files/attachment-launcher';
import { AttachmentTempFiles } from '../../src/main/files/attachment-temp-files';
import type { CommandRunner } from '../../src/main/files/command-runner';
import type { FileViewer } from '../../src/main/files/file-viewer';
import { XattrFileQuarantine } from '../../src/main/files/xattr-file-quarantine';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';
import { createTestLogger } from './support/memory-log-sink';
import { createTempDir, type TempDir } from './support/temp-dir';

interface ViewedFile {
  readonly action: 'open' | 'quickLook';
  readonly path: string;
  readonly displayName?: string;
}

class RecordingViewer implements FileViewer {
  readonly viewed: ViewedFile[] = [];
  failure: Error | null = null;

  open(path: string): Promise<void> {
    this.viewed.push({ action: 'open', path });
    return this.failure === null ? Promise.resolve() : Promise.reject(this.failure);
  }

  quickLook(path: string, displayName: string): Promise<void> {
    this.viewed.push({ action: 'quickLook', path, displayName });
    return Promise.resolve();
  }
}

const appMetadata = {
  name: 'Relay',
  version: '0.1.16',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const NOW = { now: () => new Date('2026-11-19T10:00:00Z') };

describe('opening received attachments in the system', () => {
  let dir: TempDir;
  let root: string;
  let viewer: RecordingViewer;
  let commands: (readonly string[])[];

  const runner: CommandRunner = (file, args) => {
    commands.push([file, ...args]);
    return Promise.resolve();
  };

  const bridgeWith = (files: AttachmentTempFiles) =>
    createRelayBridge(
      new InMemoryIpc(
        composeIpc({
          app: appMetadata,
          attachmentLauncher: new AttachmentLauncher(
            files,
            viewer,
            new XattrFileQuarantine('darwin', 'Relay', runner, NOW, createTestLogger().logger),
          ),
        }),
      ),
      () => 'attachment-stream',
    );

  const viewedPath = (index = 0): string => viewer.viewed[index]?.path ?? '';

  beforeEach(async () => {
    dir = await createTempDir();
    root = dir.file('Relay-attachments');
    viewer = new RecordingViewer();
    commands = [];
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('writes the attachment under its own name into the temp folder and opens it', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));

    const result = await bridge.invoke('app.attachments.open', {
      filename: 'Faktúra 11.pdf',
      content: PDF,
    });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(viewer.viewed).toHaveLength(1);
    expect(viewer.viewed[0]?.action).toBe('open');
    expect(basename(viewedPath())).toBe('Faktúra 11.pdf');
    expect(dirname(dirname(viewedPath()))).toBe(root);
    expect(new Uint8Array(await readFile(viewedPath()))).toEqual(PDF);
    expect(commands).toEqual([
      ['/usr/bin/xattr', '-w', 'com.apple.quarantine', '0081;6afec8a0;Relay;', viewedPath()],
    ]);
  });

  it('shows Quick Look with the original name as the title', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));

    await bridge.invoke('app.attachments.quickLook', { filename: 'zmluva.docx', content: PDF });

    expect(viewer.viewed).toEqual([
      { action: 'quickLook', path: viewedPath(), displayName: 'zmluva.docx' },
    ]);
    expect(basename(viewedPath())).toBe('zmluva.docx');
    expect(commands.map((command) => command.at(-1))).toEqual([viewedPath()]);
  });

  it('keeps every opened copy so the same name never overwrites a file in use', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));

    await bridge.invoke('app.attachments.open', { filename: 'a.txt', content: PDF });
    await bridge.invoke('app.attachments.open', { filename: 'a.txt', content: new Uint8Array(1) });

    expect(viewedPath(0)).not.toBe(viewedPath(1));
    expect(await readdir(root)).toHaveLength(2);
    expect(new Uint8Array(await readFile(viewedPath(0)))).toEqual(PDF);
  });

  it('turns path tricks into plain file names inside the temp folder', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));
    const names = ['../../etc/passwd', '..', '.bashrc', 'C:\\Windows\\win.ini', 'a/../../b.pdf'];

    for (const filename of names) {
      await bridge.invoke('app.attachments.quickLook', { filename, content: PDF });
    }

    const opened = viewer.viewed.map((entry) => entry.path);
    expect(opened.map((path) => basename(path))).toEqual([
      '_.._etc_passwd',
      'priloha',
      'bashrc',
      'C__Windows_win.ini',
      'a_.._.._b.pdf',
    ]);
    opened.forEach((path) => {
      expect(relative(root, path).split(/[\\/]/)).toHaveLength(2);
    });
  });

  it('shortens very long names and keeps the extension', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));

    await bridge.invoke('app.attachments.open', {
      filename: `${'ľ'.repeat(200)}.pdf`,
      content: PDF,
    });

    const name = basename(viewedPath());
    expect(name.endsWith('.pdf')).toBe(true);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(200);
  });

  it('refuses a temp folder name that would leave the temp root', async () => {
    const files = new AttachmentTempFiles(root, () => '../escape');
    const bridge = bridgeWith(files);

    const result = await bridge.invoke('app.attachments.open', { filename: 'a.pdf', content: PDF });

    expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    expect(viewer.viewed).toEqual([]);
    expect(await readdir(dir.path)).toEqual([]);
  });

  it('validates the input before touching the disk', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));
    const invalid: unknown[] = [
      { filename: '', content: PDF },
      { filename: 'a\u0000b.pdf', content: PDF },
      { filename: 'a.pdf', content: 'JVBERi0=' },
      { filename: 'a.pdf', content: new Uint8Array(MAX_OPENED_ATTACHMENT_BYTES + 1) },
      { filename: 'a.pdf' },
    ];

    for (const input of invalid) {
      const result = await bridge.invoke('app.attachments.open', input as never);
      expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    }

    expect(viewer.viewed).toEqual([]);
    expect(await readdir(dir.path)).toEqual([]);
  });

  it('opens only known document types and still shows anything else in Quick Look', async () => {
    const bridge = bridgeWith(new AttachmentTempFiles(root));
    const names = [
      'faktura.pdf.command',
      'run.SH',
      'stranka.hta',
      'setup.exe',
      'odkaz.lnk',
      'disk.iso',
      'bez-pripony',
      'skript.command. ',
    ];

    for (const filename of names) {
      const result = await bridge.invoke('app.attachments.open', { filename, content: PDF });
      expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    }
    await bridge.invoke('app.attachments.quickLook', { filename: 'run.sh', content: PDF });

    expect(viewer.viewed.map((entry) => entry.action)).toEqual(['quickLook']);
    expect(await readdir(root)).toHaveLength(1);

    for (const filename of ['Tabuľka.XLSX', 'pozvanka.ics', 'archiv.zip', 'faktura.pdf. ']) {
      const result = await bridge.invoke('app.attachments.open', { filename, content: PDF });
      expect(result).toEqual({ ok: true, data: { ok: true } });
    }
    expect(viewer.viewed.map((entry) => basename(entry.path))).toEqual([
      'run.sh',
      'Tabuľka.XLSX',
      'pozvanka.ics',
      'archiv.zip',
      'faktura.pdf',
    ]);
  });

  it('reports a file the system cannot open', async () => {
    viewer.failure = new ProviderError('Súbor sa nepodarilo otvoriť: no app');
    const bridge = bridgeWith(new AttachmentTempFiles(root));

    const result = await bridge.invoke('app.attachments.open', {
      filename: 'a.docx',
      content: PDF,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'provider_error', message: 'Súbor sa nepodarilo otvoriť: no app' },
    });
  });

  it('clears the files opened in earlier runs', async () => {
    const files = new AttachmentTempFiles(root);
    await bridgeWith(files).invoke('app.attachments.open', { filename: 'a.pdf', content: PDF });

    await files.clear();

    expect(await readdir(dir.path)).toEqual([]);
  });
});
