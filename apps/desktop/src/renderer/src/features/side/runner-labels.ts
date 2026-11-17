import type { AiRunnerKind } from '@relay/shared';

export const RUNNERS: readonly (readonly [AiRunnerKind, string])[] = [
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
];

export const runnerLabelOf = (runner: AiRunnerKind): string =>
  RUNNERS.find(([kind]) => kind === runner)?.[1] ?? runner;
