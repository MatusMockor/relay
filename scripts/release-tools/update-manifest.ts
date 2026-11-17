import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { FeedError } from './feed-error.ts';

const FeedFileSchema = z.looseObject({
  url: z.string().min(1),
  sha512: z.string().min(1),
  size: z.number().int().nonnegative(),
});

const DateLikeSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

const UpdateManifestSchema = z.object({
  version: z.string().min(1),
  files: z.array(FeedFileSchema).min(1),
  path: z.string().min(1).optional(),
  sha512: z.string().min(1).optional(),
  releaseDate: DateLikeSchema.optional(),
});

export type FeedFile = z.output<typeof FeedFileSchema>;

export type UpdateManifest = z.output<typeof UpdateManifestSchema>;

const parseYaml = (text: string, source: string): unknown => {
  try {
    return parse(text) as unknown;
  } catch {
    throw new FeedError(`${source}: not valid YAML`);
  }
};

export const parseUpdateManifest = (text: string, source: string): UpdateManifest => {
  const parsed = UpdateManifestSchema.safeParse(parseYaml(text, source));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new FeedError(`${source}: not an update manifest (${issues.join('; ')})`);
  }
  return parsed.data;
};

export const serializeUpdateManifest = (manifest: UpdateManifest): string =>
  stringify(manifest, { lineWidth: 0 });
