import { accessSync, constants, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const StepSchema = z.object({
  uses: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const ArchMatrixSchema = z.object({ include: z.array(z.object({ arch: z.string() })) });
const ShardMatrixSchema = z.object({ shard: z.array(z.number().int().positive()) });

const JobSchema = z.object({
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  if: z.string().optional(),
  environment: z.string().optional(),
  permissions: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  strategy: z.object({ matrix: z.union([ArchMatrixSchema, ShardMatrixSchema]) }).optional(),
  steps: z.array(StepSchema),
});

const archEntries = (entry: Job | undefined): string[] => {
  const matrix = entry?.strategy?.matrix;
  if (matrix === undefined || !('include' in matrix)) {
    return [];
  }
  return matrix.include.map((item) => item.arch);
};

const WorkflowSchema = z.object({
  permissions: z.record(z.string(), z.string()),
  jobs: z.record(z.string(), JobSchema),
});

type Job = z.output<typeof JobSchema>;

const repoRoot = join(import.meta.dirname, '..', '..');
const workflowText = readFileSync(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8');
const workflow = WorkflowSchema.parse(parse(workflowText));
const jobs = Object.entries(workflow.jobs);
const job = (name: string): Job | undefined => workflow.jobs[name];

const PINNED_ACTION = /^actions\/[a-z-]+@[0-9a-f]{40}$/;
const SECRET = /\$\{\{\s*secrets\./;

describe('release.yml', () => {
  it('pins every action to a commit and keeps the default token read-only', () => {
    const uses = jobs.flatMap(([, entry]) => entry.steps.flatMap((step) => step.uses ?? []));
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(uses.filter((action) => !PINNED_ACTION.test(action))).toEqual([]);
    const writers = jobs.filter(([, entry]) => entry.permissions?.['contents'] === 'write');
    expect(writers.map(([name]) => name)).toEqual(['publish']);
  });

  it('never persists checkout credentials', () => {
    const checkouts = jobs.flatMap(([, entry]) =>
      entry.steps.filter((step) => step.uses?.startsWith('actions/checkout@')),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    checkouts.forEach((step) => {
      expect(step.with?.['persist-credentials']).toBe(false);
    });
  });

  it('hands secrets only to single steps of jobs in the release environment', () => {
    jobs.forEach(([name, entry]) => {
      expect(JSON.stringify(entry.env ?? {}), name).not.toMatch(SECRET);
      const secretSteps = entry.steps.filter((step) => SECRET.test(JSON.stringify(step.env ?? {})));
      if (secretSteps.length === 0) {
        return;
      }
      expect(entry.environment, name).toBe('release');
    });
    expect(workflowText.match(/secrets\.[A-Z_]+/g)?.sort()).toEqual(
      [
        'secrets.APPLE_API_ISSUER',
        'secrets.APPLE_API_ISSUER',
        'secrets.APPLE_API_KEY',
        'secrets.APPLE_API_KEY',
        'secrets.APPLE_API_KEY_ID',
        'secrets.APPLE_API_KEY_ID',
        'secrets.CSC_KEY_PASSWORD',
        'secrets.CSC_LINK',
        'secrets.RELAY_GOOGLE_CLIENT_ID',
        'secrets.RELAY_GOOGLE_CLIENT_SECRET',
      ].sort(),
    );
  });

  it('builds Linux for both architectures without secrets or the release environment', () => {
    const linux = job('build-linux');
    expect(linux?.environment).toBeUndefined();
    expect(archEntries(linux)).toEqual(['x64', 'arm64']);
    expect(JSON.stringify(linux)).not.toMatch(SECRET);
  });

  it('gates publish on every parallel check job and both platform builds', () => {
    const checkJobNames = jobs
      .map(([name]) => name)
      .filter((name) => name.startsWith('check-'))
      .sort();
    expect(checkJobNames.length).toBeGreaterThan(0);
    const checksGate = job('checks');
    const checksNeeds = Array.isArray(checksGate?.needs) ? [...checksGate.needs].sort() : [];
    expect(checksNeeds).toEqual(checkJobNames);
    const publish = job('publish');
    expect(archEntries(job('build-mac'))).toEqual(['arm64', 'x64']);
    expect(publish?.if).toBe("github.event_name == 'push'");
    expect(publish?.needs).toEqual(['version', 'checks', 'build-mac', 'build-linux']);
  });

  it('only runs release tools that exist and are executable', () => {
    const tools = [...workflowText.matchAll(/scripts\/release-tools\/([a-z-]+\.sh)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(tools.length).toBeGreaterThan(5);
    tools.forEach((tool) => {
      expect(() => {
        accessSync(join(repoRoot, 'scripts', 'release-tools', tool), constants.X_OK);
      }, tool).not.toThrow();
    });
  });
});
