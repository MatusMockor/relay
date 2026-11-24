import { createRequire } from 'node:module';
import { join } from 'node:path';
import { z } from 'zod';
import { qaPaths } from '../config/qa-paths';

export const electronBinary = (): string => {
  const require = createRequire(join(qaPaths.desktopDir, 'package.json'));
  return z.string().min(1).parse(require('electron'));
};
