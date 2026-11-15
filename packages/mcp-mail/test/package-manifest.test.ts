import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const ManifestSchema = z.object({ bin: z.record(z.string(), z.string()).optional() });
const PACKAGE_ROOT = new URL('../', import.meta.url);

describe('package manifest', () => {
  it('declares only bin targets that start with an interpreter directive', async () => {
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(new URL('package.json', PACKAGE_ROOT), 'utf8')),
    );

    for (const target of Object.values(manifest.bin ?? {})) {
      expect(await readFile(new URL(target, PACKAGE_ROOT), 'utf8')).toMatch(/^#!/);
    }
  });
});
