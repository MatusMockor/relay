import { describe, expect, it } from 'vitest';
import {
  resolveUpdateAvailability,
  type UpdatePlatformFacts,
} from '../../src/main/updates/update-availability';

const facts = (overrides: Partial<UpdatePlatformFacts>): UpdatePlatformFacts => ({
  platform: 'darwin',
  isPackaged: true,
  appImage: undefined,
  packageType: null,
  ...overrides,
});

describe('resolveUpdateAvailability', () => {
  it('updates the packaged, signed macOS app', () => {
    expect(resolveUpdateAvailability(facts({}))).toEqual({ enabled: true });
  });

  it('never updates a development build', () => {
    expect(resolveUpdateAvailability(facts({ isPackaged: false }))).toEqual({
      enabled: false,
      reason: 'development',
    });
  });

  it('updates the Linux AppImage', () => {
    expect(
      resolveUpdateAvailability(
        facts({ platform: 'linux', appImage: '/home/jana/Relay.AppImage' }),
      ),
    ).toEqual({ enabled: true });
  });

  it('leaves the deb to the package manager, even when APPIMAGE is set', () => {
    const deb = { enabled: false, reason: 'manual-package' };
    expect(resolveUpdateAvailability(facts({ platform: 'linux', packageType: 'deb' }))).toEqual(
      deb,
    );
    expect(
      resolveUpdateAvailability(facts({ platform: 'linux', packageType: 'deb', appImage: '/x' })),
    ).toEqual(deb);
    expect(resolveUpdateAvailability(facts({ platform: 'linux', appImage: ' ' }))).toEqual(deb);
  });

  it('does not update other platforms', () => {
    expect(resolveUpdateAvailability(facts({ platform: 'win32' }))).toEqual({
      enabled: false,
      reason: 'unsupported-platform',
    });
  });
});
