import { BlockList, isIP } from 'node:net';

const BLOCKED_V4: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_V6: readonly [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const blocked = new BlockList();
BLOCKED_V4.forEach(([network, prefix]) => {
  blocked.addSubnet(network, prefix, 'ipv4');
});
BLOCKED_V6.forEach(([network, prefix]) => {
  blocked.addSubnet(network, prefix, 'ipv6');
});

const embeddedV4 = (address: string): string | null => {
  const lower = address.toLowerCase();
  const mapped = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1] !== undefined) {
    return mapped[1];
  }
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] === undefined || hex[2] === undefined) {
    return null;
  }
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
};

export const isPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) {
    return !blocked.check(address, 'ipv4');
  }
  if (family !== 6) {
    return false;
  }
  const v4 = embeddedV4(address);
  if (v4 !== null) {
    return isIP(v4) === 4 && !blocked.check(v4, 'ipv4');
  }
  return !blocked.check(address, 'ipv6');
};
