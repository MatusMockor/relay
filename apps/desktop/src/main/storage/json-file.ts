import type { z } from 'zod';
import { AtomicFile } from './atomic-file';
import { parseJsonOrNull } from './parse-json';

export class JsonFile<Schema extends z.ZodType> {
  private readonly file: AtomicFile;

  constructor(
    path: string,
    private readonly schema: Schema,
  ) {
    this.file = new AtomicFile(path);
  }

  async read(): Promise<z.output<Schema> | null> {
    const content = await this.file.read();
    if (content === null) {
      return null;
    }
    const parsed = this.schema.safeParse(parseJsonOrNull(Buffer.from(content).toString('utf8')));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  async write(value: z.output<Schema>): Promise<void> {
    await this.file.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}
