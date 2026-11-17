import { readPackageVersion, releaseVersionProblem } from './package-version.ts';
import { reportProblems, runCli } from './run-cli.ts';

await runCli(async ([manifestPath, tag]) => {
  if (manifestPath === undefined) {
    console.error('usage: node verify-package-version.ts <package.json> [vX.Y.Z]');
    return 2;
  }
  const version = await readPackageVersion(manifestPath);
  const problem = releaseVersionProblem(version, tag);
  if (problem !== null) {
    return reportProblems([problem]);
  }
  console.log(version);
  return 0;
});
