import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number<number | string>().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});
export type Env = z.infer<typeof EnvSchema>;

export const parseEnv = (raw: Readonly<Record<string, unknown>>): Env => {
  const result = EnvSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid server environment: ${details}`);
};
