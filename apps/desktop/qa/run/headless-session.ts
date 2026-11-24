import { QA_SESSION_MARKER } from '../config/qa-env';
import { qaPaths } from '../config/qa-paths';
import { runStep } from './spawn-step';

const SCREEN = '-screen 0 1920x1200x24';

const sessionCommand = (scenarioPath: string, headed: boolean): readonly string[] => {
  const scenario = [qaPaths.tsxBin, scenarioPath];
  if (headed) {
    return ['--', ...scenario];
  }
  return ['--', 'xvfb-run', '--auto-servernum', `--server-args=${SCREEN}`, ...scenario];
};

export const runInHeadlessSession = (scenarioPath: string, headed: boolean): Promise<number> =>
  runStep('dbus-run-session', sessionCommand(scenarioPath, headed), {
    cwd: qaPaths.desktopDir,
    env: { ...process.env, QA_SESSION: QA_SESSION_MARKER },
  });
