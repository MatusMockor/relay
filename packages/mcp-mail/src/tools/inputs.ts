import { EmailAddressSchema, type Address } from '@relay/shared/domain';
import { z } from 'zod';

export const DEFAULT_LIMIT = 20;

export const limitInput = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe(`Maximum number of results (default ${DEFAULT_LIMIT})`);

export const cursorInput = z
  .string()
  .min(1)
  .max(500)
  .optional()
  .describe('Cursor from a previous nextCursor value');

export const addressInput = z.object({
  email: EmailAddressSchema,
  name: z.string().max(500).optional(),
});

export function toAddress(input: z.infer<typeof addressInput>): Address {
  return { email: input.email, name: input.name ?? null };
}
