import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { esmCommonJsShim } from '../../main-chunk-banner';

const ShimProbeSchema = z.object({
  hasTransform: z.boolean(),
  filename: z.string(),
  dirname: z.string(),
});

type ShimProbe = z.infer<typeof ShimProbeSchema>;

const temporaryDirs: string[] = [];

const runChunkWithBanner = (body: string): ShimProbe => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-banner-'));
  temporaryDirs.push(dir);
  const file = join(dir, 'chunk.mjs');
  writeFileSync(file, `${esmCommonJsShim}\n${body}`);
  return ShimProbeSchema.parse(
    JSON.parse(execFileSync(process.execPath, [file], { encoding: 'utf8' })),
  );
};

const electronViteSources = (): string[] => {
  const distDir = dirname(createRequire(import.meta.url).resolve('electron-vite'));
  return readdirSync(distDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(distDir, name), 'utf8'));
};

afterEach(() => {
  temporaryDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('main process chunk banner', () => {
  it('gives bundled CommonJS code a working require, __filename and __dirname', () => {
    const probe = runChunkWithBanner(
      [
        'let streamModule;',
        "try { streamModule = require('stream'); } catch {}",
        'console.log(JSON.stringify({',
        "  hasTransform: typeof streamModule?.Transform === 'function',",
        '  filename: __filename,',
        '  dirname: __dirname,',
        '}));',
      ].join('\n'),
    );

    expect(probe.hasTransform).toBe(true);
    expect(probe.filename.endsWith('chunk.mjs')).toBe(true);
    expect(probe.dirname).toBe(dirname(probe.filename));
  });

  it('matches the electron-vite ESM shim so electron-vite never injects a second one', () => {
    expect(electronViteSources().some((source) => source.includes(esmCommonJsShim))).toBe(true);
  });
});
