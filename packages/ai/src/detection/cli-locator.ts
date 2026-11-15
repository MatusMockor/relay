import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface CliLocatorOptions {
  readonly pathEnv?: string;
  readonly extraDirs?: readonly string[];
}

export function defaultExtraDirs(home: string = homedir()): string[] {
  return [
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
}

export class CliLocator {
  private readonly dirs: readonly string[];

  constructor(options: CliLocatorOptions = {}) {
    const pathDirs = (options.pathEnv ?? process.env.PATH ?? '').split(delimiter);
    const all = [...pathDirs, ...(options.extraDirs ?? defaultExtraDirs())];
    this.dirs = [...new Set(all.filter((dir) => dir.length > 0))];
  }

  async locate(executableName: string): Promise<string | null> {
    for (const dir of this.dirs) {
      const candidate = join(dir, executableName);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return false;
    }
    await access(path, constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}
