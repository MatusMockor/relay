import type { AiRunnerRegistry } from '@relay/engine';
import type { AiEvent } from '@relay/shared/domain';
import type { AiLocationGate } from '../ai/ai-location-gate';
import type { LocalAiRuns } from '../ai/local-ai-runs';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { IpcStreamHandlers } from '../ipc/stream-router';

export interface AiHandlerDeps {
  readonly registry: AiRunnerRegistry;
  readonly gate: AiLocationGate;
  readonly runs: LocalAiRuns | null;
}

export const createAiInvokeHandlers = (deps: AiHandlerDeps): IpcInvokeHandlers => ({
  'ai.detectRunners': () => deps.registry.detectAll(),
});

async function* gatedRun(
  deps: AiHandlerDeps,
  runs: LocalAiRuns,
  request: Parameters<LocalAiRuns['stream']>[0],
): AsyncGenerator<AiEvent> {
  await deps.gate.assertLocal();
  yield* runs.stream(request);
}

export const createAiStreamHandlers = (deps: AiHandlerDeps): IpcStreamHandlers => {
  const { runs } = deps;
  if (runs === null) {
    return {};
  }
  return {
    'ai.run': ({ input, runner }, signal) => gatedRun(deps, runs, { input, runner, signal }),
  };
};
