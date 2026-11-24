import { qaPaths } from '../config/qa-paths';
import { runRequiredStep } from './spawn-step';

export const compileApp = async (skip: boolean): Promise<void> => {
  if (skip) {
    return;
  }
  await runRequiredStep(qaPaths.electronViteBin, ['build', '--logLevel', 'warn'], {
    cwd: qaPaths.desktopDir,
  });
};
