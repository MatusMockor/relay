import { z } from 'zod';

export const CREDENTIALS_KEY_BYTES = 32;

export const CredentialsKeySchema = z
  .string()
  .min(1)
  .transform((value) => Buffer.from(value, 'base64'))
  .refine((key) => key.length === CREDENTIALS_KEY_BYTES, {
    message: `must be ${String(CREDENTIALS_KEY_BYTES)} bytes encoded as base64`,
  });

export const parseCredentialsKey = (raw: string): Buffer => CredentialsKeySchema.parse(raw);
