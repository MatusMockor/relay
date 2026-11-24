import { setTimeout as sleep } from 'node:timers/promises';
import type { ScreenshotBook } from './screenshot-book';

export const captureAt = async (
  book: ScreenshotBook,
  label: string,
  offsetsMs: readonly number[],
  startedAt: number = Date.now(),
): Promise<string[]> => {
  const files: string[] = [];
  for (const offset of [...offsetsMs].sort((left, right) => left - right)) {
    const wait = startedAt + offset - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    files.push(await book.take(`${label}-${String(offset / 1_000)}s`));
  }
  return files;
};
