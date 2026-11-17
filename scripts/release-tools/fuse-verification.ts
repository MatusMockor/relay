import fuses from '@electron/fuses';
import { parse } from 'yaml';
import { z } from 'zod';
import { FeedError } from './feed-error.ts';

export const DISABLED = 48;
export const ENABLED = 49;

export type ExpectedFuses = Readonly<Record<string, boolean>>;
export type FuseWire = Partial<Record<number, number>>;

const BuilderFusesSchema = z.object({
  electronFuses: z.record(z.string(), z.boolean()),
});

const FUSE_OPTIONS: Readonly<Record<string, unknown>> = fuses.FuseV1Options;

const optionIndex = (name: string): number | undefined => {
  const index = FUSE_OPTIONS[`${name.charAt(0).toUpperCase()}${name.slice(1)}`];
  return typeof index === 'number' ? index : undefined;
};

const stateLabel = (state: number | undefined): string => {
  if (state === ENABLED) {
    return 'enabled';
  }
  if (state === DISABLED) {
    return 'disabled';
  }
  return state === undefined ? 'missing' : `state ${state}`;
};

export const expectedFusesFromBuilderConfig = (text: string): ExpectedFuses => {
  const parsed = BuilderFusesSchema.safeParse(parse(text) as unknown);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new FeedError(`electron-builder config has no valid electronFuses (${fields})`);
  }
  return parsed.data.electronFuses;
};

const fuseProblem = (name: string, expected: boolean, wire: FuseWire): string | null => {
  const index = optionIndex(name);
  if (index === undefined) {
    return `${name}: unknown fuse`;
  }
  const state = wire[index];
  const wanted = expected ? ENABLED : DISABLED;
  if (state === wanted) {
    return null;
  }
  return `${name}: expected ${stateLabel(wanted)}, found ${stateLabel(state)}`;
};

export const fuseProblems = (expected: ExpectedFuses, wire: FuseWire): string[] =>
  Object.entries(expected)
    .map(([name, value]) => fuseProblem(name, value, wire))
    .filter((problem): problem is string => problem !== null);

export const readFuseWire = async (appPath: string): Promise<FuseWire> => {
  const config: Readonly<Record<string, unknown>> = await fuses.getCurrentFuseWire(appPath);
  return Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) =>
      /^\d+$/.test(key) && typeof value === 'number' ? [[Number(key), value] as const] : [],
    ),
  );
};
