import type { ApiErrorBody } from '@relay/shared/api';
import type { AiEvent } from '@relay/shared/domain';
import type { AiRunRequest, RelayBridge } from '@relay/shared/ipc';

export interface RunOutcome {
  readonly events: AiEvent[];
  readonly error: ApiErrorBody | null;
}

export const runAi = (bridge: RelayBridge, input: AiRunRequest): Promise<RunOutcome> =>
  new Promise((resolve) => {
    const events: AiEvent[] = [];
    bridge.subscribe(
      'ai.run',
      {
        onEvent: (event) => events.push(event),
        onEnd: () => {
          resolve({ events, error: null });
        },
        onError: (error) => {
          resolve({ events, error });
        },
      },
      input,
    );
  });
