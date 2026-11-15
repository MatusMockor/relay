import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RunWorkspace {
  readonly dir: string;
  writePrivateFile(name: string, content: string): Promise<string>;
  dispose(): Promise<void>;
}

export interface RunWorkspaceFactory {
  create(): Promise<RunWorkspace>;
}

export class TempRunWorkspaceFactory implements RunWorkspaceFactory {
  constructor(private readonly root: string = tmpdir()) {}

  async create(): Promise<RunWorkspace> {
    const dir = await mkdtemp(join(this.root, 'relay-ai-'));
    return {
      dir,
      writePrivateFile: async (name, content) => {
        const path = join(dir, name);
        await writeFile(path, content, { mode: 0o600 });
        return path;
      },
      dispose: () => rm(dir, { recursive: true, force: true }),
    };
  }
}
