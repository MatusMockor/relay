import type { RendererSessionKey } from '@relay/shared';
import type { MailClient } from '../data/MailClient';

const keys = new WeakMap<MailClient, RendererSessionKey>();

export const sessionKeyOf = (client: MailClient): RendererSessionKey => {
  const existing = keys.get(client);
  if (existing !== undefined) {
    return existing;
  }
  const created = crypto.randomUUID();
  keys.set(client, created);
  return created;
};
