import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const desktopDir = fileURLToPath(new URL('../../', import.meta.url));
const ASSET_IMPORT = /from '([^']+)\?asset'/g;

const sourceFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
};

const assetImports = async (): Promise<string[]> => {
  const files = await sourceFiles(join(desktopDir, 'src/main'));
  const nested = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      return [...source.matchAll(ASSET_IMPORT)].map((match) =>
        relative(desktopDir, join(dirname(file), match[1] ?? '')),
      );
    }),
  );
  return nested.flat();
};

describe('packaged assets', () => {
  it('ships every main-process asset inside the app package', async () => {
    const builder = await readFile(join(desktopDir, 'electron-builder.yml'), 'utf8');
    const assets = await assetImports();

    expect(assets).toContain('resources/trayTemplate.png');
    expect(builder).toMatch(/^ {2}- resources\/\*\.png$/m);
    assets.forEach((asset) => {
      expect(asset).toMatch(/^resources\/[^/]+\.png$/);
    });
  });
});
