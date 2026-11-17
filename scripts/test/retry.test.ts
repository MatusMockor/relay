import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, '..', 'release-tools', 'retry.sh');

const STUB_CODESIGN = `#!/usr/bin/env bash
count_file="$STUB_DIR/count"
count=0
[ -f "$count_file" ] && count="$(cat "$count_file")"
count=$((count + 1))
printf '%s' "$count" >"$count_file"
if [ "$count" -le "$STUB_FAILURES" ]; then
  echo "Relay.app/Contents/Frameworks/locale.pak: $STUB_ERROR" >&2
  exit 1
fi
echo signed
`;

let dir = '';
let stub = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'relay-retry-'));
  stub = join(dir, 'codesign-stub');
  writeFileSync(stub, STUB_CODESIGN);
  chmodSync(stub, 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const run = (failures: number, error: string, attempts = 3) =>
  spawnSync('bash', [script, 'timestamp', stub], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STUB_DIR: dir,
      STUB_FAILURES: String(failures),
      STUB_ERROR: error,
      RETRY_ATTEMPTS: String(attempts),
      RETRY_DELAY_SECONDS: '0',
    },
  });

const calls = (): number => {
  const file = join(dir, 'count');
  return existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0;
};

describe('retry.sh timestamp', () => {
  it('retries while Apple does not return a timestamp and then succeeds', () => {
    const result = run(2, 'A timestamp was expected but was not found.');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('signed\n');
    expect(calls()).toBe(3);
  });

  it('gives up after the configured number of attempts', () => {
    const result = run(5, 'The timestamp service is not available.');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('still failing with a transient error after 3 attempts');
    expect(calls()).toBe(3);
  });

  it('does not retry a signing error that is not about the timestamp', () => {
    const result = run(5, 'errSecInternalComponent');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('errSecInternalComponent');
    expect(calls()).toBe(1);
  });
});
