import { compareAssetDirs } from './asset-comparison.ts';
import { reportProblems, runCli } from './run-cli.ts';

await runCli(async ([expectedDir, actualDir]) => {
  if (expectedDir === undefined || actualDir === undefined) {
    console.error('usage: node verify-release-assets.ts <local-feed-dir> <downloaded-release-dir>');
    return 2;
  }
  const status = reportProblems(await compareAssetDirs(expectedDir, actualDir));
  if (status === 0) {
    console.log(`release assets match ${expectedDir}`);
  }
  return status;
});
