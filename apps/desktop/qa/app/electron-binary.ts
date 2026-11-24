import { createRequire } from 'node:module';
import { join } from 'node:path';
import { z } from 'zod';
import { qaPaths } from '../config/qa-paths';

export const electronBinary = (appDir: string = qaPaths.desktopDir): string => {
  const require = createRequire(join(appDir, 'package.json'));
  return z.string().min(1).parse(require('electron'));
};
