import { readFile, writeFile } from 'node:fs/promises';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  DeviceSettingsSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeviceSettingsStore } from '../../src/main/settings/device-settings-store';
import { type JsonDocument, JsonFile } from '../../src/main/storage/json-file';
import { createTempDir, type TempDir } from './support/temp-dir';

class SlowFirstReadDocument implements JsonDocument<DeviceSettings> {
  private release: () => void = () => undefined;
  private readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  private reads = 0;

  constructor(private readonly file: JsonFile<typeof DeviceSettingsSchema>) {}

  async read(): Promise<DeviceSettings | null> {
    this.reads += 1;
    const first = this.reads === 1;
    const content = await this.file.read();
    if (first) {
      await this.released;
    }
    return content;
  }

  write(value: DeviceSettings): Promise<void> {
    return this.file.write(value);
  }

  finishFirstRead(): void {
    this.release();
  }
}

describe('DeviceSettingsStore', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('returns defaults when no file exists yet', async () => {
    const store = new DeviceSettingsStore(dir.file('device-settings.json'));
    expect(await store.get()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('merges patches, persists them and reloads them in a new instance', async () => {
    const path = dir.file('device-settings.json');
    const store = new DeviceSettingsStore(path);
    await store.update({ mode: 'synced', panelWidths: { sidebar: 300 } });
    const updated = await store.update({
      savedServers: [{ name: 'Domov', url: 'https://relay.example.com' }],
      activeServerUrl: 'https://relay.example.com',
    });
    expect(updated).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      mode: 'synced',
      panelWidths: { ...DEFAULT_DEVICE_SETTINGS.panelWidths, sidebar: 300 },
      savedServers: [{ name: 'Domov', url: 'https://relay.example.com' }],
      activeServerUrl: 'https://relay.example.com',
    });
    expect(await new DeviceSettingsStore(path).get()).toEqual(updated);
    const raw = JSON.parse(await readFile(path, 'utf8')) as { mode: string };
    expect(raw.mode).toBe('synced');
  });

  it('keeps an update made while the first read of the file is still in flight', async () => {
    const document = new SlowFirstReadDocument(
      new JsonFile(dir.file('device-settings.json'), DeviceSettingsSchema),
    );
    const store = new DeviceSettingsStore(document);

    const firstRead = store.get();
    const updating = store.update({ mode: 'synced' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    document.finishFirstRead();
    await Promise.all([firstRead, updating]);

    expect((await store.get()).mode).toBe('synced');
  });

  it('serializes concurrent updates without losing any field', async () => {
    const store = new DeviceSettingsStore(dir.file('device-settings.json'));
    await Promise.all([
      store.update({ mode: 'local' }),
      store.update({ panelWidths: { list: 500 } }),
      store.update({ panelWidths: { rightPanel: 400 } }),
    ]);
    const reloaded = await new DeviceSettingsStore(dir.file('device-settings.json')).get();
    expect(reloaded.mode).toBe('local');
    expect(reloaded.panelWidths).toEqual({ sidebar: 232, list: 500, rightPanel: 400 });
  });

  it('rejects a patch that produces invalid settings and keeps the previous state', async () => {
    const store = new DeviceSettingsStore(dir.file('device-settings.json'));
    await store.update({ mode: 'local' });
    await expect(
      store.update({ activeServerUrl: 'https://relay.example.com/?token=1' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect((await store.get()).activeServerUrl).toBeNull();
  });

  it('loads a file written before themes existed without losing its fields', async () => {
    const path = dir.file('device-settings.json');
    const legacy = {
      savedServers: [],
      activeServerUrl: null,
      mode: 'local',
      panelWidths: { sidebar: 300, list: 420, rightPanel: 320 },
      selectedAccountId: null,
    };
    await writeFile(path, JSON.stringify(legacy));

    expect(await new DeviceSettingsStore(path).get()).toEqual({
      ...legacy,
      theme: 'dark',
      offlineWindow: '6m',
    });
  });

  it('persists the chosen theme and keeps it across other updates', async () => {
    const path = dir.file('device-settings.json');
    const store = new DeviceSettingsStore(path);
    await store.update({ theme: 'paper' });
    await store.update({ mode: 'local' });

    const reloaded = await new DeviceSettingsStore(path).get();
    expect(reloaded.theme).toBe('paper');
    expect(reloaded.mode).toBe('local');
  });

  it('falls back to defaults when the file is corrupt', async () => {
    const path = dir.file('device-settings.json');
    await writeFile(path, '{ not json');
    expect(await new DeviceSettingsStore(path).get()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });
});
