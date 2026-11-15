import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_DEVICE_SETTINGS } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeviceSettingsStore } from '../../src/main/settings/device-settings-store';
import { createTempDir, type TempDir } from './support/temp-dir';

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

  it('falls back to defaults when the file is corrupt', async () => {
    const path = dir.file('device-settings.json');
    await writeFile(path, '{ not json');
    expect(await new DeviceSettingsStore(path).get()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });
});
