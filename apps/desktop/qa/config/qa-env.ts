import { z } from 'zod';

const flag = z
  .string()
  .optional()
  .transform((value) => value === '1' || value === 'true');

const QaEnvSchema = z.object({
  QA_KEEP_PROFILE: flag,
  QA_KEEP_USER: flag,
  QA_SKIP_BUILD: flag,
  QA_SKIP_NATIVE: flag,
  QA_HEADED: flag,
  QA_VERBOSE: flag,
  QA_SESSION: z.string().optional(),
  QA_LEGACY_APP_DIR: z.string().min(1).optional(),
  QA_SCREENSHOT_SET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional(),
  QA_COUNT: z.coerce.number().int().min(1).max(100_000).optional(),
  QA_WINDOW_WIDTH: z.coerce.number().int().min(960).max(3840).default(1440),
  QA_WINDOW_HEIGHT: z.coerce.number().int().min(600).max(2160).default(900),
});

export type QaEnv = z.infer<typeof QaEnvSchema>;

export const QA_SESSION_MARKER = 'isolated-dbus';

export const readQaEnv = (env: NodeJS.ProcessEnv = process.env): QaEnv => QaEnvSchema.parse(env);
