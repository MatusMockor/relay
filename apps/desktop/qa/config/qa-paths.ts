import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const qaDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const qaPaths = {
  qaDir,
  desktopDir: resolve(qaDir, '..'),
  repoRoot: resolve(qaDir, '..', '..', '..'),
  screenshotRoot: resolve(qaDir, '..', '..', '..', 'qa-screenshots'),
  tsxBin: resolve(qaDir, '..', 'node_modules', '.bin', 'tsx'),
  electronViteBin: resolve(qaDir, '..', 'node_modules', '.bin', 'electron-vite'),
} as const;

export const scenarioFile = (name: string): string => resolve(qaDir, 'scenarios', `${name}.ts`);
