import { describe, expect, it } from 'vitest';
import { isIpLiteral, isPublicAddress } from '../src/net';

const DENIED_V4 = [
  ['0/8', '0.1.2.3'],
  ['10/8', '10.0.0.1'],
  ['100.64/10', '100.64.0.1'],
  ['127/8', '127.0.0.1'],
  ['169.254/16', '169.254.169.254'],
  ['172.16/12', '172.31.255.255'],
  ['192.0.0/24', '192.0.0.8'],
  ['192.0.2/24', '192.0.2.10'],
  ['192.88.99/24', '192.88.99.1'],
  ['192.168/16', '192.168.1.1'],
  ['198.18/15', '198.19.0.1'],
  ['198.51.100/24', '198.51.100.7'],
  ['203.0.113/24', '203.0.113.9'],
  ['224/4', '224.0.0.1'],
  ['240/4', '255.255.255.255'],
] as const;

const hexOf = (dotted: string): string => {
  const [a = 0, b = 0, c = 0, d = 0] = dotted.split('.').map(Number);
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
};

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '142.250.74.110',
    '2a00:1450:4014:80d::200e',
    '2606:4700::6810:84e5',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '64:ff9b::808:808',
    '64:ff9b::8.8.8.8',
  ])('allows the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each(DENIED_V4)('denies IPv4 %s and its IPv6 embeddings', (_range, address) => {
    const hex = hexOf(address);
    const [high = '0', low = '0'] = hex.split(':');
    const sixToFour = `2002:${high}:${low}::1`;
    for (const candidate of [
      address,
      `::ffff:${address}`,
      `::ffff:${hex}`,
      `0:0:0:0:0:ffff:${hex}`,
      `::${address}`,
      `::${hex}`,
      `64:ff9b::${address}`,
      `64:ff9b::${hex}`,
      `64:ff9b:1::${hex}`,
      sixToFour,
    ]) {
      expect(isPublicAddress(candidate), candidate).toBe(false);
    }
  });

  it.each([
    ['decimal', '2130706433'],
    ['octal', '017700000001'],
    ['hex', '0x7f000001'],
    ['short hex', '0x7f.1'],
  ])('normalizes %s integer hosts before checking', (_kind, address) => {
    expect(isIpLiteral(address)).toBe(true);
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    ['unspecified', '::'],
    ['loopback', '::1'],
    ['IPv4-compatible with a public IPv4', '::8.8.8.8'],
    ['NAT64 with a private IPv4', '64:ff9b::a00:1'],
    ['NAT64 local use', '64:ff9b:1::808:808'],
    ['6to4 with a public IPv4', '2002:808:808::1'],
    ['Teredo', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
    ['IETF special purpose', '2001:2::1'],
    ['documentation', '2001:db8::1'],
    ['site local', 'fec0::1'],
    ['unique local', 'fc00::1'],
    ['link local', 'fe80::1'],
    ['multicast', 'ff02::1'],
    ['discard only', '100::1'],
    ['outside global unicast', '4000::1'],
  ])('denies IPv6 %s', (_kind, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['not-an-ip', 'example.com', '', '1.2.3.4/8', '::1%eth0', '[::1'])(
    'treats %s as not a public address',
    (candidate) => {
      expect(isPublicAddress(candidate)).toBe(false);
    },
  );
});
