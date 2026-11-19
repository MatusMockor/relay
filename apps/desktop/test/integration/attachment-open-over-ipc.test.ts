// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { AttachmentLauncher } from '../../src/main/files/attachment-launcher';
import { AttachmentTempFiles } from '../../src/main/files/attachment-temp-files';
import { execFileRunner } from '../../src/main/files/exec-file-runner';
import type { FileViewer } from '../../src/main/files/file-viewer';
import { XattrFileQuarantine } from '../../src/main/files/xattr-file-quarantine';
import { systemClock } from '../../src/main/infra/system-clock';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { InMemoryIpc } from '../main/in-memory-ipc';
import { createTestLogger } from '../main/support/memory-log-sink';
import { createTempDir, type TempDir } from '../main/support/temp-dir';

const appMetadata = {
  name: 'Relay',
  version: '0.1.16',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

class RecordingViewer implements FileViewer {
  readonly opened: string[] = [];
  readonly quickLooks: string[] = [];

  open(path: string): Promise<void> {
    this.opened.push(path);
    return Promise.resolve();
  }

  quickLook(path: string): Promise<void> {
    this.quickLooks.push(path);
    return Promise.resolve();
  }
}

const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]);

describe('opening attachments from the renderer over IPC', () => {
  let dir: TempDir;
  let viewer: RecordingViewer;

  const startPlatform = () => {
    const launcher = new AttachmentLauncher(
      new AttachmentTempFiles(dir.path),
      viewer,
      new XattrFileQuarantine(
        'linux',
        'Relay',
        execFileRunner,
        systemClock,
        createTestLogger().logger,
      ),
    );
    const bridge = createRelayBridge(
      new InMemoryIpc(composeIpc({ app: appMetadata, attachmentLauncher: launcher })),
      () => 'attachment-open',
    );
    return createElectronPlatform(bridge);
  };

  beforeEach(async () => {
    dir = await createTempDir();
    viewer = new RecordingViewer();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('sends the downloaded bytes to the main process and opens the written copy', async () => {
    const opener = startPlatform().attachmentOpener;

    await opener?.open(new Blob([BYTES]), 'zmluva.docx');
    await opener?.showQuickLook(new Blob([BYTES]), 'zmluva.docx');

    expect(viewer.opened).toHaveLength(1);
    expect(viewer.quickLooks).toHaveLength(1);
    expect(basename(viewer.opened[0] ?? '')).toBe('zmluva.docx');
    expect(new Uint8Array(await readFile(viewer.quickLooks[0] ?? ''))).toEqual(BYTES);
  });

  it('rejects with the main process error for an invalid name', async () => {
    const opener = startPlatform().attachmentOpener;

    await expect(opener?.open(new Blob([BYTES]), '   ')).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(viewer.opened).toEqual([]);
  });
});
