import { readFile } from 'node:fs/promises';
import { expectedFusesFromBuilderConfig, fuseProblems, readFuseWire } from './fuse-verification.ts';
import { reportProblems, runCli } from './run-cli.ts';

await runCli(async ([appPath, builderConfig]) => {
  if (appPath === undefined || builderConfig === undefined) {
    console.error('usage: node verify-fuses.ts <path/to/app> <electron-builder.yml>');
    return 2;
  }
  const expected = expectedFusesFromBuilderConfig(await readFile(builderConfig, 'utf8'));
  const status = reportProblems(fuseProblems(expected, await readFuseWire(appPath)));
  if (status === 0) {
    Object.entries(expected).forEach(([name, value]) => {
      console.log(`ok ${name}=${String(value)}`);
    });
  }
  return status;
});
