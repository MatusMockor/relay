import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseSocketPath } from '../../src/main/ai/local-mail-tools-server';

describe('chooseSocketPath', () => {
  it('keeps the socket in the app data directory when the path is short enough', () => {
    expect(chooseSocketPath('/home/jana/.config/Relay', '/tmp')).toBe(
      '/home/jana/.config/Relay/mail-tools.sock',
    );
  });

  it('measures the socket path limit in UTF-8 bytes, not in characters', () => {
    const directory = `/tmp/${'界'.repeat(35)}`;

    const chosen = chooseSocketPath(directory, '/var/tmp');

    expect(dirname(chosen)).toBe('/var/tmp');
    expect(Buffer.byteLength(chosen, 'utf8')).toBeLessThanOrEqual(100);
  });

  it('falls back to /tmp when the temporary directory itself is too long', () => {
    const chosen = chooseSocketPath(`/data/${'a'.repeat(120)}`, `/var/${'t'.repeat(120)}`);

    expect(dirname(chosen)).toBe('/tmp');
  });
});
