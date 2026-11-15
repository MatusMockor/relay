import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export class AtomicFile {
  private pending: Promise<void> = Promise.resolve();
  private sequence = 0;

  constructor(readonly path: string) {}

  async read(): Promise<Uint8Array | null> {
    try {
      return await readFile(this.path);
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  write(content: Uint8Array | string): Promise<void> {
    const next = this.pending.then(() => this.replace(content));
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async replace(content: Uint8Array | string): Promise<void> {
    this.sequence += 1;
    const temporary = `${this.path}.${String(process.pid)}.${String(this.sequence)}.tmp`;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, this.path);
  }
}
