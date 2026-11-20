import { z } from 'zod';

export const QueryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);
