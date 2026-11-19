import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type NativeThemePort,
  NativeThemeSync,
  type ThemedWindows,
} from '../../src/main/native/native-theme-sync';
import { DeviceSettingsStore } from '../../src/main/settings/device-settings-store';
import type { NativeThemeSource } from '../../src/main/window/window-theme';
import { createTempDir, type TempDir } from './support/temp-dir';

class FakeNativeTheme implements NativeThemePort {
  readonly sources: NativeThemeSource[] = [];
  private listeners = new Set<() => void>();

  constructor(private systemDark: boolean) {}

  setSource(source: NativeThemeSource): void {
    this.sources.push(source);
  }

  prefersDark(): boolean {
    const source = this.sources.at(-1) ?? 'system';
    return source === 'system' ? this.systemDark : source === 'dark';
  }

  onUpdated(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  switchSystem(dark: boolean): void {
    this.systemDark = dark;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

class RecordingWindows implements ThemedWindows {
  readonly colors: string[] = [];

  setBackground(color: string): void {
    this.colors.push(color);
  }
}

describe('NativeThemeSync', () => {
  let dir: TempDir;
  let store: DeviceSettingsStore;

  beforeEach(async () => {
    dir = await createTempDir();
    store = new DeviceSettingsStore(dir.file('device-settings.json'));
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('applies the stored theme before the first window opens', async () => {
    await store.update({ theme: 'paper' });
    const native = new FakeNativeTheme(true);
    const windows = new RecordingWindows();
    const sync = new NativeThemeSync(store, native, windows);

    await sync.start();

    expect(sync.current()).toBe('paper');
    expect(sync.background()).toBe('#f3efe6');
    expect(native.sources).toEqual(['light']);
    sync.stop();
  });

  it('follows a theme picked later and repaints open windows', async () => {
    const native = new FakeNativeTheme(false);
    const windows = new RecordingWindows();
    const sync = new NativeThemeSync(store, native, windows);
    await sync.start();

    await store.update({ theme: 'black' });

    expect(native.sources).toEqual(['dark', 'dark']);
    expect(windows.colors.at(-1)).toBe('#000000');
    sync.stop();
  });

  it('repaints with the operating system appearance while following the system', async () => {
    await store.update({ theme: 'system' });
    const native = new FakeNativeTheme(true);
    const windows = new RecordingWindows();
    const sync = new NativeThemeSync(store, native, windows);
    await sync.start();
    expect(windows.colors.at(-1)).toBe('#0b0d12');

    native.switchSystem(false);

    expect(native.sources).toEqual(['system']);
    expect(windows.colors.at(-1)).toBe('#f5f6f8');
    sync.stop();
  });

  it('stops listening once stopped', async () => {
    const native = new FakeNativeTheme(true);
    const windows = new RecordingWindows();
    const sync = new NativeThemeSync(store, native, windows);
    await sync.start();
    sync.stop();

    await store.update({ theme: 'light' });

    expect(native.listenerCount()).toBe(0);
    expect(native.sources).toEqual(['dark']);
  });
});
