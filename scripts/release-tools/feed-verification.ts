import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { FeedError } from './feed-error.ts';
import { MANIFEST_NAMES, rulesForManifest } from './feed-manifests.ts';
import type { FeedRules } from './feed-rules.ts';
import { fileHash } from './file-hash.ts';
import { parseUpdateManifest, type FeedFile, type UpdateManifest } from './update-manifest.ts';

export interface FeedReport {
  readonly manifest: UpdateManifest;
  readonly archs: string[];
  readonly problems: string[];
}

const sizeOf = (file: string): Promise<number | null> =>
  stat(file).then(
    (info) => info.size,
    () => null,
  );

const isPlainName = (url: string): boolean => basename(url) === url && url !== '..' && url !== '.';

const checkEntry = async (feedDir: string, entry: FeedFile): Promise<string | null> => {
  if (!isPlainName(entry.url)) {
    return `${entry.url}: not a plain file name`;
  }
  const file = join(feedDir, entry.url);
  const size = await sizeOf(file);
  if (size === null) {
    return `${entry.url}: missing`;
  }
  if (size !== entry.size) {
    return `${entry.url}: size ${size} != ${entry.size}`;
  }
  if ((await fileHash(file, 'sha512', 'base64')) !== entry.sha512) {
    return `${entry.url}: sha512 mismatch`;
  }
  return null;
};

const primaryProblem = (manifest: UpdateManifest): string | null => {
  if (manifest.path === undefined) {
    return null;
  }
  const listed = manifest.files.some(
    (entry) => entry.url === manifest.path && entry.sha512 === manifest.sha512,
  );
  return listed ? null : `path ${manifest.path} does not match a listed file with the same sha512`;
};

const versionProblem = (manifest: UpdateManifest, expected: string | undefined): string | null => {
  if (expected === undefined || manifest.version === expected) {
    return null;
  }
  return `manifest version ${manifest.version} != release version ${expected}`;
};

const rulesFor = (manifestFile: string): FeedRules => {
  const rules = rulesForManifest(basename(manifestFile));
  if (rules === null) {
    const known = MANIFEST_NAMES.join(', ');
    throw new FeedError(`${manifestFile}: unknown update manifest, expected one of ${known}`);
  }
  return rules;
};

export const verifyFeed = async (
  manifestFile: string,
  expectedVersion?: string,
): Promise<FeedReport> => {
  const rules = rulesFor(manifestFile);
  const manifest = parseUpdateManifest(await readFile(manifestFile, 'utf8'), manifestFile);
  const entryProblems = await Promise.all(
    manifest.files.map((entry) => checkEntry(dirname(manifestFile), entry)),
  );
  const problems = [
    versionProblem(manifest, expectedVersion),
    ...entryProblems,
    ...rules.problems(manifest),
    primaryProblem(manifest),
  ].filter((problem): problem is string => problem !== null);
  return { manifest, archs: rules.archs(manifest), problems };
};
