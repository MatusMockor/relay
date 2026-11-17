import type { UpdateManifest } from './update-manifest.ts';

export interface FeedRules {
  archs(manifest: UpdateManifest): string[];
  problems(manifest: UpdateManifest): string[];
}
