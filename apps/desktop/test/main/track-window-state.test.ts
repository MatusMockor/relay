import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TrackedWindow, trackWindowState } from '../../src/main/native/track-window-state';
import { WindowStateStore } from '../../src/main/native/window-state-store';
import { createTestLogger } from './support/memory-log-sink';
import { createTempDir, type TempDir } from './support/temp-dir';

class ClosingWindow implements TrackedWindow {
  private readonly listeners = new Map<string, () => void>();

  isDestroyed(): boolean {
    return false;
  }

  isMinimized(): boolean {
    return false;
  }

  isFullScreen(): boolean {
    return false;
  }

  isMaximized(): boolean {
    return false;
  }

  getNormalBounds() {
    return { x: 10, y: 20, width: 1200, height: 800 };
  }

  on(event: string, listener: () => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  emit(event: string): void {
    this.listeners.get(event)?.();
  }
}

describe('trackWindowState', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('logs a window position that cannot be saved instead of leaking the rejection', async () => {
    await writeFile(dir.file('not-a-directory'), '');
    const store = new WindowStateStore(dir.file('not-a-directory/window-state.json'));
    const log = createTestLogger();
    const window = new ClosingWindow();
    trackWindowState(window, store, log.logger);

    window.emit('close');
    await expect.poll(() => log.sink.messages()).toContain('Failed to save the window position');
  });
});
