import { verifyFeed } from './feed-verification.ts';
import { reportProblems, runCli } from './run-cli.ts';

const USAGE =
  'usage: node verify-feed.ts <latest-mac.yml|latest-linux.yml|latest-linux-arm64.yml> [version]';

await runCli(async ([manifestFile, expectedVersion]) => {
  if (manifestFile === undefined) {
    console.error(USAGE);
    return 2;
  }
  const report = await verifyFeed(manifestFile, expectedVersion);
  if (report.problems.length > 0) {
    return reportProblems(report.problems);
  }
  report.manifest.files.forEach((entry) => {
    console.log(`ok ${entry.url} size=${entry.size}`);
  });
  const { version, files } = report.manifest;
  console.log(`feed ${version} valid: ${files.length} files, archs ${report.archs.join(', ')}`);
  return 0;
});
