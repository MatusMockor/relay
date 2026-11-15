import { FastifyAdapter } from '@nestjs/platform-fastify';
import { MAX_ATTACHMENT_BYTES } from '@relay/shared/domain';

const BODY_LIMIT_BYTES = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 1024 * 1024;

export const createFastifyAdapter = (trustProxyHops: number): FastifyAdapter =>
  new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: (_address: string, hop: number) => hop < trustProxyHops,
  });
