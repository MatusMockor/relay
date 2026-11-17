import { z } from 'zod';

const BakedValueSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? '');

const BuildEnvSchema = z.object({
  RELAY_GOOGLE_CLIENT_ID: BakedValueSchema,
  RELAY_GOOGLE_CLIENT_SECRET: BakedValueSchema,
});

type Env = Readonly<Record<string, string | undefined>>;

export const bakedMainDefines = (env: Env): Record<string, string> => {
  const values = BuildEnvSchema.parse(env);
  return {
    'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_ID': JSON.stringify(values.RELAY_GOOGLE_CLIENT_ID),
    'import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_SECRET': JSON.stringify(
      values.RELAY_GOOGLE_CLIENT_SECRET,
    ),
  };
};
