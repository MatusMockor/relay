import { readQaEnv } from '../config/qa-env';
import { scenarioFile } from '../config/qa-paths';
import { SCENARIOS, ScenarioNameSchema } from '../scenarios/registry';
import { compileApp } from './compile-app';
import { runInHeadlessSession } from './headless-session';
import { withElectronAbi } from './native-abi';

const parsed = ScenarioNameSchema.safeParse(process.argv[2]);
if (!parsed.success) {
  console.error(`Usage: qa <scenario>. Known scenarios: ${SCENARIOS.join(', ')}`);
  process.exit(2);
}

const env = readQaEnv();
const code = await withElectronAbi(env.QA_SKIP_NATIVE, async () => {
  await compileApp(env.QA_SKIP_BUILD);
  return runInHeadlessSession(scenarioFile(parsed.data), env.QA_HEADED);
});
process.exitCode = code;
