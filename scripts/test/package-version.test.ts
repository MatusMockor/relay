import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FeedError } from '../release-tools/feed-error.ts';
import { readPackageVersion, releaseVersionProblem } from '../release-tools/package-version.ts';

let dir = '';

const manifest = (content: unknown): string => {
  const file = join(dir, 'package.json');
  writeFileSync(file, JSON.stringify(content));
  return file;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'relay-version-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readPackageVersion', () => {
  it('reads the semver version of the desktop package', async () => {
    expect(await readPackageVersion(manifest({ name: '@relay/desktop', version: '1.4.0' }))).toBe(
      '1.4.0',
    );
  });

  it('rejects a manifest without a semver version', async () => {
    await expect(readPackageVersion(manifest({ version: 'latest' }))).rejects.toThrow(FeedError);
    await expect(readPackageVersion(manifest({ name: 'x' }))).rejects.toThrow(/not semver/);
  });
});

describe('releaseVersionProblem', () => {
  it('accepts a tag that matches the package version', () => {
    expect(releaseVersionProblem('1.4.0', 'v1.4.0')).toBeNull();
    expect(releaseVersionProblem('1.4.0-beta.1', 'v1.4.0-beta.1')).toBeNull();
  });

  it('accepts a dry run without a tag', () => {
    expect(releaseVersionProblem('1.4.0', undefined)).toBeNull();
    expect(releaseVersionProblem('1.4.0', '')).toBeNull();
  });

  it('reports a tag that does not match the package version', () => {
    expect(releaseVersionProblem('1.4.0', 'v1.4.1')).toBe(
      'tag v1.4.1 does not match apps/desktop/package.json version 1.4.0',
    );
  });

  it('reports a tag that is not v<semver>', () => {
    expect(releaseVersionProblem('1.4.0', '1.4.0')).toBe('tag 1.4.0 is not v<semver>');
    expect(releaseVersionProblem('1.4.0', 'v1.4')).toBe('tag v1.4 is not v<semver>');
  });
});
