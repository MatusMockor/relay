import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export type HostResolver = (hostname: string) => Promise<readonly string[]>;

const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

const PRIVATE_V6 = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const;

const blocked = (() => {
  const list = new BlockList();
  PRIVATE_V4.forEach(([network, prefix]) => {
    list.addSubnet(network, prefix, 'ipv4');
  });
  PRIVATE_V6.forEach(([network, prefix]) => {
    list.addSubnet(network, prefix, 'ipv6');
  });
  return list;
})();

const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export const isPublicAddress = (candidate: string): boolean => {
  const address = MAPPED_V4.exec(candidate)?.[1] ?? candidate;
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

export const systemResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, order: 'verbatim' })).map((entry) => entry.address);

export const resolvesPublicly = async (
  resolver: HostResolver,
  hostname: string,
): Promise<boolean> => {
  const addresses = await resolver(hostname);
  return addresses.length > 0 && addresses.every(isPublicAddress);
};
