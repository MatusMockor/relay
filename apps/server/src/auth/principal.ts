import type { DeviceId, UserId } from '@relay/shared/domain';

export interface Principal {
  readonly userId: UserId;
  readonly deviceId: DeviceId;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
