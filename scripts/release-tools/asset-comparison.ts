import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileHash } from './file-hash.ts';

const fileNames = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
};

const contentProblem = async (
  expectedDir: string,
  actualDir: string,
  name: string,
): Promise<string | null> => {
  const [expected, actual] = await Promise.all([
    fileHash(join(expectedDir, name), 'sha256', 'hex'),
    fileHash(join(actualDir, name), 'sha256', 'hex'),
  ]);
  return expected === actual ? null : `${name}: sha256 differs`;
};

export const compareAssetDirs = async (
  expectedDir: string,
  actualDir: string,
): Promise<string[]> => {
  const [expected, actual] = await Promise.all([fileNames(expectedDir), fileNames(actualDir)]);
  const missing = expected
    .filter((name) => !actual.includes(name))
    .map((name) => `${name}: missing from the release`);
  const unexpected = actual
    .filter((name) => !expected.includes(name))
    .map((name) => `${name}: not in the local feed`);
  const shared = expected.filter((name) => actual.includes(name));
  const differing = await Promise.all(
    shared.map((name) => contentProblem(expectedDir, actualDir, name)),
  );
  return [
    ...missing,
    ...unexpected,
    ...differing.filter((problem): problem is string => problem !== null),
  ];
};
