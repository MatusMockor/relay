export interface IpAddress {
  readonly family: 4 | 6;
  readonly value: bigint;
}

const WIDTH: Readonly<Record<IpAddress['family'], bigint>> = { 4: 32n, 6: 128n };

const DOTTED_QUAD = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const hostnameOf = (authority: string): string | null => {
  const href = `http://${authority}/`;
  return URL.canParse(href) ? new URL(href).hostname : null;
};

const v4Value = (host: string): bigint =>
  host.split('.').reduce((total, octet) => (total << 8n) + BigInt(octet), 0n);

const hextets = (part: string): string[] => part.split(':').filter((group) => group !== '');

const v6Value = (host: string): bigint => {
  const [head = '', tail = ''] = host.split('::');
  const left = hextets(head);
  const right = hextets(tail);
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return groups.reduce((total, group) => (total << 16n) + BigInt(`0x${group}`), 0n);
};

const parseV6 = (candidate: string): IpAddress | null => {
  const host = hostnameOf(`[${candidate.replace(/^\[|\]$/g, '')}]`);
  if (host === null || !host.startsWith('[')) {
    return null;
  }
  return { family: 6, value: v6Value(host.slice(1, -1)) };
};

const parseV4 = (candidate: string): IpAddress | null => {
  const host = hostnameOf(candidate);
  return host !== null && DOTTED_QUAD.test(host) ? { family: 4, value: v4Value(host) } : null;
};

export const parseIp = (candidate: string): IpAddress | null => {
  if (candidate === '' || /[/?#@\s]/.test(candidate)) {
    return null;
  }
  return candidate.includes(':') ? parseV6(candidate) : parseV4(candidate);
};

export const inPrefix = (address: IpAddress, network: IpAddress, bits: number): boolean => {
  const shift = WIDTH[address.family] - BigInt(bits);
  return address.family === network.family && address.value >> shift === network.value >> shift;
};

export const lowV4 = (value: bigint): IpAddress => ({ family: 4, value: value & 0xffff_ffffn });
