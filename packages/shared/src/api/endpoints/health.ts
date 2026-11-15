import { z } from 'zod';
import { defineEndpoint } from '../endpoint';

export const API_VERSION = 1;

export const HealthResponseSchema = z.object({
  name: z.literal('relay'),
  version: z.string().min(1),
  apiVersion: z.literal(API_VERSION),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const healthEndpoints = {
  get: defineEndpoint({
    method: 'GET',
    path: '/health',
    auth: 'public',
    response: HealthResponseSchema,
  }),
};
