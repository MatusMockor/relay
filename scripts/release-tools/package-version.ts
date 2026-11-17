import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FeedError } from './feed-error.ts';

const NUMBER = '(?:0|[1-9]\\d*)';
const IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER = new RegExp(
  `^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`,
);
const ARCH_NAME = /arm64|x64/;

export const versionShapeProblem = (version: string): string | null => {
  const match = SEMVER.exec(version);
  if (match === null) {
    return 'not semver';
  }
  if (ARCH_NAME.test(match[1] ?? '')) {
    return 'a prerelease that names an architecture (arm64, x64)';
  }
  return null;
};

const PackageManifestSchema = z.object({ version: z.string() });

export const readPackageVersion = async (manifestPath: string): Promise<string> => {
  const parsed = PackageManifestSchema.safeParse(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (!parsed.success) {
    throw new FeedError(`${manifestPath}: version is missing or not semver`);
  }
  const problem = versionShapeProblem(parsed.data.version);
  if (problem !== null) {
    throw new FeedError(`${manifestPath}: version ${parsed.data.version} is ${problem}`);
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
  if (!tag.startsWith('v') || versionShapeProblem(tag.slice(1)) !== null) {
    return `tag ${tag} is not v<semver>`;
  }
  const tagVersion = tag.slice(1);
  if (tagVersion === packageVersion) {
    return null;
  }
  return `tag ${tag} does not match apps/desktop/package.json version ${packageVersion}`;
};
