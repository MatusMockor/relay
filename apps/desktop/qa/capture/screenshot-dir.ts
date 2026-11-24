import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readQaEnv } from '../config/qa-env';
import { qaPaths } from '../config/qa-paths';

export const freshScenarioDir = async (scenario: string): Promise<string> => {
  const set = readQaEnv().QA_SCREENSHOT_SET;
  const dir = join(qaPaths.screenshotRoot, ...(set === undefined ? [] : [set]), scenario);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
};
