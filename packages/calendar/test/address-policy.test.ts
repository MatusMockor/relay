import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../src';

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['142.250.74.110', true],
    ['2a00:1450:4014:80d::200e', true],
    ['::ffff:8.8.8.8', true],
    ['64:ff9b::808:808', true],
    ['127.0.0.1', false],
    ['0.0.0.0', false],
    ['10.0.0.1', false],
    ['100.64.0.1', false],
    ['172.31.255.255', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['224.0.0.1', false],
    ['255.255.255.255', false],
    ['::', false],
    ['::1', false],
    ['fe80::1', false],
    ['fc00::1', false],
    ['ff02::1', false],
    ['::ffff:10.0.0.1', false],
    ['::ffff:7f00:1', false],
    ['64:ff9b::a00:1', false],
    ['2001:db8::1', false],
    ['not-an-ip', false],
  ])('%s -> %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});
