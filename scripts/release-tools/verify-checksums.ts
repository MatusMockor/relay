import { verifyChecksums } from './checksum-verification.ts';
import { reportProblems, runCli } from './run-cli.ts';

await runCli(async (checksumFiles) => {
  if (checksumFiles.length === 0) {
    console.error('usage: node verify-checksums.ts <SHA256SUMS> [...]');
    return 2;
  }
  const reports = await Promise.all(
    checksumFiles.map(async (file) => ({ file, report: await verifyChecksums(file) })),
  );
  const problems = reports.flatMap(({ file, report }) =>
    report.problems.map((problem) => `${file}: ${problem}`),
  );
  if (problems.length > 0) {
    return reportProblems(problems);
  }
  reports.forEach(({ file, report }) => {
    console.log(`checksums ${file} valid: ${report.entries.length} files`);
  });
  return 0;
});
