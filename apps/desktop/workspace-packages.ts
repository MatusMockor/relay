import { readFileSync } from 'node:fs';
import { z } from 'zod';

const PackageManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
});

const WORKSPACE_SCOPE = '@relay/';

export const workspaceDependencies = (manifestPath: string): string[] => {
  const manifest = PackageManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  return Object.keys(manifest.dependencies)
    .filter((name) => name.startsWith(WORKSPACE_SCOPE))
    .sort();
};
