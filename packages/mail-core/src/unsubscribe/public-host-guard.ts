import { lookup } from 'node:dns/promises';
import { isIpLiteral, isPublicAddress } from '@relay/shared/net';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type HostResolver = (hostname: string) => Promise<readonly string[]>;

export const systemResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, order: 'verbatim' })).map((entry) => entry.address);

export const resolvePublicAddress = async (
  resolver: HostResolver,
  hostname: string,
): Promise<ResolvedAddress | null> => {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIpLiteral(bare) ? [bare] : await resolver(bare);
  const first = addresses[0];
  if (first === undefined || !addresses.every(isPublicAddress)) {
    return null;
  }
  return { address: first, family: first.includes(':') ? 6 : 4 };
};
