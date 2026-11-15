import { z } from 'zod';
import { DeviceSchema } from '../../domain/device';
import { DeviceIdSchema } from '../../domain/ids';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const DeviceViewSchema = DeviceSchema.extend({ current: z.boolean() });
export type DeviceView = z.infer<typeof DeviceViewSchema>;

export const devicesEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/devices',
    auth: 'user',
    response: z.array(DeviceViewSchema),
  }),
  revoke: defineEndpoint({
    method: 'DELETE',
    path: '/devices/:id',
    auth: 'user',
    params: idParamsOf(DeviceIdSchema),
    response: OkResponseSchema,
  }),
};
