import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mergeMacManifests } from './mac-manifest.ts';
import { runCli } from './run-cli.ts';
import { parseUpdateManifest, serializeUpdateManifest } from './update-manifest.ts';

const USAGE = 'usage: node merge-latest-mac.ts <out.yml> <latest-mac.yml> <latest-mac.yml> [...]';

await runCli(async ([outFile, ...inputs]) => {
  if (outFile === undefined || inputs.length < 2) {
    console.error(USAGE);
    return 2;
  }
  const manifests = await Promise.all(
    inputs.map(async (file) => parseUpdateManifest(await readFile(file, 'utf8'), file)),
  );
  const merged = mergeMacManifests(manifests);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, serializeUpdateManifest(merged));
  console.log(`merged ${merged.files.length} files for ${merged.version} into ${outFile}`);
  return 0;
});
