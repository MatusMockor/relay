import type { ImapFlow } from 'imapflow';

export type CapabilityClient = Pick<ImapFlow, 'capabilities' | 'enabled'>;

type Rev2FoldedCapability = 'MOVE' | 'UIDPLUS';

const isRev2Active = (client: CapabilityClient): boolean =>
  client.enabled.has('IMAP4REV2') ||
  (client.capabilities.has('IMAP4rev2') && !client.capabilities.has('IMAP4rev1'));

export const hasCapability = (
  client: CapabilityClient,
  capability: Rev2FoldedCapability,
): boolean => client.capabilities.has(capability) || isRev2Active(client);
