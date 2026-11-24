import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readQaEnv } from '../config/qa-env';
import { runRequiredStep } from './spawn-step';

const compiledMain = (appDir: string): string => join(appDir, 'out', 'main', 'index.js');

export const legacyAppDir = async (): Promise<string> => {
  const configured = readQaEnv().QA_LEGACY_APP_DIR;
  assert.ok(
    configured !== undefined,
    'Set QA_LEGACY_APP_DIR to the apps/desktop folder of a checkout of the previous release.',
  );
  const appDir = resolve(configured);
  assert.ok(existsSync(join(appDir, 'package.json')), `${appDir} has no package.json`);
  if (existsSync(compiledMain(appDir))) {
    return appDir;
  }
  await runRequiredStep(
    join(appDir, 'node_modules', '.bin', 'electron-vite'),
    ['build', '--logLevel', 'warn'],
    { cwd: appDir },
  );
  assert.ok(
    existsSync(compiledMain(appDir)),
    `electron-vite did not produce ${compiledMain(appDir)}`,
  );
  return appDir;
};
