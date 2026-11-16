import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceDependencies } from '../../workspace-packages';

const desktopRoot = resolve(import.meta.dirname, '../..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const importedWorkspacePackages = (dir: string): string[] => {
  const specifiers = sourceFiles(dir).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/from '(@relay\/[a-z-]+)/g)].map((match) => match[1]),
  );
  return [...new Set(specifiers)].filter((name) => name !== undefined).sort();
};

describe('workspace packages bundled into the main process', () => {
  it('bundles every workspace package the main process and preload import', () => {
    const bundled = workspaceDependencies(join(desktopRoot, 'package.json'));
    const imported = [
      ...importedWorkspacePackages(join(desktopRoot, 'src/main')),
      ...importedWorkspacePackages(join(desktopRoot, 'src/preload')),
    ];

    expect(bundled).toContain('@relay/calendar');
    expect(imported.filter((name) => !bundled.includes(name))).toEqual([]);
  });
});
