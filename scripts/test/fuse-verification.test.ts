import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FeedError } from '../release-tools/feed-error.ts';
import {
  DISABLED,
  ENABLED,
  expectedFusesFromBuilderConfig,
  fuseProblems,
  type FuseWire,
} from '../release-tools/fuse-verification.ts';

const builderConfig = readFileSync(
  join(import.meta.dirname, '..', '..', 'apps', 'desktop', 'electron-builder.yml'),
  'utf8',
);

const RELAY_FUSES = {
  runAsNode: true,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  onlyLoadAppFromAsar: true,
};

const relayWire: FuseWire = {
  0: ENABLED,
  1: ENABLED,
  2: DISABLED,
  3: DISABLED,
  4: DISABLED,
  5: ENABLED,
};

describe('expectedFusesFromBuilderConfig', () => {
  it('electron-builder.yml declares exactly the Relay fuse set', () => {
    expect(expectedFusesFromBuilderConfig(builderConfig)).toEqual(RELAY_FUSES);
  });

  it('rejects a config without electronFuses', () => {
    expect(() => expectedFusesFromBuilderConfig('appId: sk.relay.desktop\n')).toThrow(FeedError);
  });

  it('rejects a fuse that is not a boolean', () => {
    expect(() => expectedFusesFromBuilderConfig('electronFuses:\n  runAsNode: maybe\n')).toThrow(
      /runAsNode/,
    );
  });
});

describe('fuseProblems', () => {
  it('accepts a wire that matches the expectation', () => {
    expect(fuseProblems(RELAY_FUSES, relayWire)).toEqual([]);
  });

  it('reports a disabled RunAsNode fuse the MCP mail server needs', () => {
    expect(fuseProblems(RELAY_FUSES, { ...relayWire, 0: DISABLED })).toEqual([
      'runAsNode: expected enabled, found disabled',
    ]);
  });

  it('reports a fuse missing from the wire', () => {
    const wire: FuseWire = { ...relayWire, 5: undefined };

    expect(fuseProblems(RELAY_FUSES, wire)).toEqual([
      'onlyLoadAppFromAsar: expected enabled, found missing',
    ]);
  });

  it('reports an unknown fuse name', () => {
    expect(fuseProblems({ runAsNodeTypo: false }, relayWire)).toEqual([
      'runAsNodeTypo: unknown fuse',
    ]);
  });
});
