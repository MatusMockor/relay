import { z } from 'zod';
import { EmailAddressSchema } from './primitives';

export const AddressSchema = z.object({
  name: z.string().max(500).nullable(),
  email: EmailAddressSchema,
});
export type Address = z.infer<typeof AddressSchema>;
