import type { FeedRules } from './feed-rules.ts';
import { LINUX_PACKAGE_FORMATS, linuxPackageName, type LinuxArch } from './linux-package.ts';
import type { UpdateManifest } from './update-manifest.ts';

const expectedNames = (manifest: UpdateManifest, arch: LinuxArch): string[] =>
  LINUX_PACKAGE_FORMATS.map((format) => linuxPackageName(manifest.version, arch, format));

const countOf = (manifest: UpdateManifest, name: string): number =>
  manifest.files.filter((entry) => entry.url === name).length;

const foreignEntries = (manifest: UpdateManifest, arch: LinuxArch): string[] => {
  const expected = expectedNames(manifest, arch);
  return manifest.files
    .filter((entry) => !expected.includes(entry.url))
    .map((entry) => `${entry.url}: not the ${arch} AppImage or deb of ${manifest.version}`);
};

const packageProblems = (manifest: UpdateManifest, arch: LinuxArch): string[] =>
  expectedNames(manifest, arch).flatMap((name) => {
    const count = countOf(manifest, name);
    return count === 1 ? [] : [`expected one ${name} entry, found ${count}`];
  });

export const linuxFeedRules = (arch: LinuxArch): FeedRules => ({
  archs: (manifest) => (packageProblems(manifest, arch).length === 0 ? [arch] : []),
  problems: (manifest) => [...foreignEntries(manifest, arch), ...packageProblems(manifest, arch)],
});
