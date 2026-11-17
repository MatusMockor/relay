import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bakedMainDefines } from '../../build-time-env';
import { bakedGoogleClient } from '../../src/main/oauth/baked-google-client';
import { createGoogleClientConfigSource } from '../../src/main/oauth/create-google-client-config-source';
import type { GoogleClientValues } from '../../src/main/oauth/provided-google-client-config';
import { createTempDir, type TempDir } from './support/temp-dir';

const NOTHING_BAKED: GoogleClientValues = { clientId: undefined, clientSecret: undefined };
const BAKED: GoogleClientValues = {
  clientId: 'baked.apps.googleusercontent.com',
  clientSecret: 'baked-secret',
};

describe('Google OAuth client config sources', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  const source = (env: Record<string, string>, baked: GoogleClientValues) =>
    createGoogleClientConfigSource({ env, baked, filePath: dir.file('google-oauth.json') });

  const writeConfigFile = (clientId: string) =>
    writeFile(dir.file('google-oauth.json'), JSON.stringify({ clientId, clientSecret: 'file' }));

  it('prefers the runtime environment over the baked-in client and the file', async () => {
    await writeConfigFile('file.apps.googleusercontent.com');
    const config = await source(
      { RELAY_GOOGLE_CLIENT_ID: ' env.apps.googleusercontent.com ' },
      BAKED,
    ).load();
    expect(config).toEqual({ clientId: 'env.apps.googleusercontent.com', clientSecret: null });
  });

  it('uses the baked-in client when the environment has none', async () => {
    await writeConfigFile('file.apps.googleusercontent.com');
    const config = await source({ RELAY_GOOGLE_CLIENT_ID: '  ' }, BAKED).load();
    expect(config).toEqual({
      clientId: 'baked.apps.googleusercontent.com',
      clientSecret: 'baked-secret',
    });
  });

  it('falls back to the file when nothing was baked into the build', async () => {
    await writeConfigFile('file.apps.googleusercontent.com');
    const config = await source({}, { clientId: '', clientSecret: '' }).load();
    expect(config).toEqual({ clientId: 'file.apps.googleusercontent.com', clientSecret: 'file' });
  });

  it('keeps explaining how to configure the client when every source is empty', async () => {
    await expect(source({}, NOTHING_BAKED).load()).rejects.toMatchObject({
      code: 'validation_failed',
      message: expect.stringContaining('RELAY_GOOGLE_CLIENT_ID') as unknown,
    });
  });

  it('reports an invalid file instead of skipping it', async () => {
    await writeFile(dir.file('google-oauth.json'), '{ "clientSecret": "only" }');
    await expect(source({}, NOTHING_BAKED).load()).rejects.toMatchObject({
      message: expect.stringContaining('nie je platný') as unknown,
    });
  });

  it('bakes nothing into a build without the CI values', () => {
    expect(bakedGoogleClient).toEqual(NOTHING_BAKED);
    expect(bakedMainDefines({})).toEqual({
      'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_ID': '""',
      'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_SECRET': '""',
    });
  });

  it('bakes the trimmed CI values as string literals', () => {
    expect(
      bakedMainDefines({
        RELAY_GOOGLE_CLIENT_ID: ' ci.apps.googleusercontent.com\n',
        RELAY_GOOGLE_CLIENT_SECRET: 'ci-secret',
      }),
    ).toEqual({
      'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_ID': '"ci.apps.googleusercontent.com"',
      'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_SECRET': '"ci-secret"',
    });
  });
});
