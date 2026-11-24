import { qaPaths } from '../config/qa-paths';
import { runRequiredStep, runStep } from './spawn-step';

const pnpmScript = (script: string) => ['run', script] as const;

const restoreNodeAbi = async (): Promise<void> => {
  const code = await runStep('pnpm', pnpmScript('native:node'), { cwd: qaPaths.desktopDir });
  if (code === 0) {
    return;
  }
  console.error(
    `Restoring better-sqlite3 for Node failed (exit ${String(code)}). Run \`pnpm --filter @relay/desktop native:node\` before the Vitest suites.`,
  );
};

export const withElectronAbi = async <Result>(
  skip: boolean,
  work: () => Promise<Result>,
): Promise<Result> => {
  if (skip) {
    return work();
  }
  try {
    await runRequiredStep('pnpm', pnpmScript('native:electron'), { cwd: qaPaths.desktopDir });
    return await work();
  } finally {
    await restoreNodeAbi();
  }
};
