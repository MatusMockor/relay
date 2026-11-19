import { describe, expect, it } from 'vitest';
import { titleBarOptions } from '../../src/main/window/title-bar-options';

describe('title bar options', () => {
  it('hides the native title bar on macOS and insets the traffic lights into the top band', () => {
    expect(titleBarOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 15 },
    });
  });

  it.each(['linux', 'win32'] as const)('keeps the native frame on %s', (platform) => {
    expect(titleBarOptions(platform)).toEqual({});
  });
});
