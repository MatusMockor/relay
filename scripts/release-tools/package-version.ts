import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FeedError } from './feed-error.ts';

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const PackageManifestSchema = z.object({ version: z.string().regex(SEMVER) });

export const readPackageVersion = async (manifestPath: string): Promise<string> => {
  const parsed = PackageManifestSchema.safeParse(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (!parsed.success) {
    throw new FeedError(`${manifestPath}: version is missing or not semver`);
  }
  return parsed.data.version;
};

export const releaseVersionProblem = (
  packageVersion: string,
  tag: string | undefined,
): string | null => {
  if (tag === undefined || tag === '') {
    return null;
  }
  if (!tag.startsWith('v') || !SEMVER.test(tag.slice(1))) {
    return `tag ${tag} is not v<semver>`;
  }
  const tagVersion = tag.slice(1);
  if (tagVersion === packageVersion) {
    return null;
  }
  return `tag ${tag} does not match apps/desktop/package.json version ${packageVersion}`;
};
