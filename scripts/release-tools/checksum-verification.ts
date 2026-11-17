import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileHash } from './file-hash.ts';

export interface ChecksumEntry {
  readonly hash: string;
  readonly name: string;
}

export interface ChecksumReport {
  readonly entries: ChecksumEntry[];
  readonly problems: string[];
}

const CHECKSUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/;

const parseLine = (line: string): ChecksumEntry | string => {
  const [, hash, name] = CHECKSUM_LINE.exec(line) ?? [];
  if (hash === undefined || name === undefined) {
    return `not a sha256sum line: ${JSON.stringify(line)}`;
  }
  if (basename(name) !== name || name === '..' || name === '.') {
    return `${name}: not a plain file name`;
  }
  return { hash, name };
};

const isFile = (file: string): Promise<boolean> =>
  stat(file).then(
    (info) => info.isFile(),
    () => false,
  );

const entryProblem = async (dir: string, entry: ChecksumEntry): Promise<string | null> => {
  const file = join(dir, entry.name);
  if (!(await isFile(file))) {
    return `${entry.name}: missing`;
  }
  const actual = await fileHash(file, 'sha256', 'hex');
  return actual === entry.hash ? null : `${entry.name}: sha256 mismatch`;
};

export const verifyChecksums = async (checksumFile: string): Promise<ChecksumReport> => {
  const lines = (await readFile(checksumFile, 'utf8')).split('\n').filter((line) => line !== '');
  const parsed = lines.map(parseLine);
  const entries = parsed.filter((line): line is ChecksumEntry => typeof line !== 'string');
  const lineProblems = parsed.filter((line): line is string => typeof line === 'string');
  const fileProblems = await Promise.all(
    entries.map((entry) => entryProblem(dirname(checksumFile), entry)),
  );
  const emptyProblem = lines.length === 0 ? ['no checksums'] : [];
  return {
    entries,
    problems: [
      ...emptyProblem,
      ...lineProblems,
      ...fileProblems.filter((problem): problem is string => problem !== null),
    ],
  };
};
