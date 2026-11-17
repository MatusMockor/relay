import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, '..', 'release-tools', 'verify-signature.sh');

const STUB_CODESIGN = `#!/usr/bin/env bash
case "$*" in
  *--entitlements*) printf '%s' "$STUB_ENTITLEMENTS" ;;
  *--verify*) exit 0 ;;
  *) printf 'Identifier=sk.relay.desktop\\nCodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1\\nTimestamp=Nov 17, 2026\\nTeamIdentifier=TEAM123456\\n' >&2 ;;
esac
`;

const entitlements = (allowJit: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${allowJit}<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/></dict></plist>`;

let dir = '';
let app = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'relay-signature-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'codesign'), STUB_CODESIGN);
  chmodSync(join(bin, 'codesign'), 0o755);
  app = join(dir, 'Relay.app');
  const prebuilds = join(
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds',
  );
  mkdirSync(prebuilds, { recursive: true });
  writeFileSync(join(prebuilds, 'darwin-arm64.node'), 'native');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const verify = (allowJit: string) =>
  spawnSync('bash', [script, app, 'arm64'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      APPLE_TEAM_ID: 'TEAM123456',
      STUB_ENTITLEMENTS: entitlements(allowJit),
    },
  });

describe.skipIf(process.platform !== 'darwin')('verify-signature.sh', () => {
  it('accepts an app signed with allow-jit set to true', () => {
    const run = verify('<key>com.apple.security.cs.allow-jit</key><true/>');
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('ok sk.relay.desktop\nok better_sqlite3.node\n');
  });

  it.each([
    ['set to false', '<key>com.apple.security.cs.allow-jit</key><false/>'],
    ['set to the string true', '<key>com.apple.security.cs.allow-jit</key><string>true</string>'],
    ['missing', ''],
  ])('rejects an app whose allow-jit entitlement is %s', (_case, allowJit) => {
    const run = verify(allowJit);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('allow-jit entitlement is not true');
    expect(run.stdout).toBe('');
  });
});
