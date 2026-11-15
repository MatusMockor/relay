import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const PackageSchema = z.object({ name: z.string(), productName: z.string() });

const readText = (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('app identity', () => {
  it('names the app Relay for Electron and electron-builder', async () => {
    const pkg = PackageSchema.parse(JSON.parse(await readText('package.json')));
    const builder = await readText('electron-builder.yml');

    expect(pkg.productName).toBe('Relay');
    expect(builder).toMatch(/^productName: Relay$/m);
  });

  it('keeps the default Debian runtime dependencies of electron-builder', async () => {
    const builder = await readText('electron-builder.yml');

    expect(builder).not.toMatch(/^\s*depends:/m);
  });
});
