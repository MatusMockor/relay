import type { FeedRules } from './feed-rules.ts';
import type { UpdateManifest } from './update-manifest.ts';
import { zipArch } from './zip-arch.ts';

export const REQUIRED_MAC_ARCHS = ['arm64', 'x64'] as const;

const coveredArchs = (manifest: UpdateManifest): string[] => {
  const found = new Set(manifest.files.map((entry) => zipArch(entry.url)));
  return REQUIRED_MAC_ARCHS.filter((arch) => found.has(arch));
};

export const macFeedRules: FeedRules = {
  archs: coveredArchs,
  problems: (manifest) => {
    const archs = coveredArchs(manifest);
    if (archs.length === REQUIRED_MAC_ARCHS.length) {
      return [];
    }
    const found = archs.join(', ') || 'none';
    return [`expected zip entries for ${REQUIRED_MAC_ARCHS.join(' and ')}, found: ${found}`];
  },
};
