import { readFile } from 'node:fs/promises';
import { runCli } from './run-cli.ts';
import { parseUpdateManifest } from './update-manifest.ts';

await runCli(async ([manifestFile]) => {
  if (manifestFile === undefined) {
    console.error('usage: node manifest-urls.ts <update-manifest.yml>');
    return 2;
  }
  const manifest = parseUpdateManifest(await readFile(manifestFile, 'utf8'), manifestFile);
  manifest.files.forEach((entry) => {
    console.log(entry.url);
  });
  return 0;
});
