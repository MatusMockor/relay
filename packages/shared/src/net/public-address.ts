import { inPrefix, type IpAddress, lowV4, parseIp } from './ip-address';

interface Prefix {
  readonly network: IpAddress;
  readonly bits: number;
}

const prefix = (cidr: string): Prefix => {
  const [address = '', bits = '0'] = cidr.split('/');
  return { network: parseIp(address) ?? { family: 6, value: 0n }, bits: Number(bits) };
};

const DENIED_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
].map(prefix);

const GLOBAL_UNICAST = prefix('2000::/3');

const DENIED_V6 = [
  '::/96',
  '64:ff9b::/96',
  '64:ff9b:1::/48',
  '2001::/23',
  '2001:db8::/32',
  '2002::/16',
  'fec0::/10',
].map(prefix);

const MAPPED = prefix('::ffff:0:0/96');
const SIX_TO_FOUR = prefix('2002::/16');
const LOW_BITS_EMBEDDING = ['::/96', '64:ff9b::/96', '64:ff9b:1::/48'].map(prefix);

const matches = (address: IpAddress, entry: Prefix): boolean =>
  inPrefix(address, entry.network, entry.bits);

const within = (address: IpAddress, prefixes: readonly Prefix[]): boolean =>
  prefixes.some((entry) => matches(address, entry));

const isPublicV4 = (address: IpAddress): boolean => !within(address, DENIED_V4);

const embeddedV4 = (address: IpAddress): IpAddress | null => {
  if (within(address, LOW_BITS_EMBEDDING)) {
    return lowV4(address.value);
  }
  return matches(address, SIX_TO_FOUR) ? lowV4(address.value >> 80n) : null;
};

const isPublicV6 = (address: IpAddress): boolean => {
  if (matches(address, MAPPED)) {
    return isPublicV4(lowV4(address.value));
  }
  const embedded = embeddedV4(address);
  if (embedded !== null && !isPublicV4(embedded)) {
    return false;
  }
  return matches(address, GLOBAL_UNICAST) && !within(address, DENIED_V6);
};

export const isPublicAddress = (candidate: string): boolean => {
  const address = parseIp(candidate);
  if (address === null) {
    return false;
  }
  return address.family === 4 ? isPublicV4(address) : isPublicV6(address);
};

export const isIpLiteral = (candidate: string): boolean => parseIp(candidate) !== null;
