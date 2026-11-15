import type { AiEvent } from '@relay/shared/domain';

export type CliSignal =
  | { readonly type: 'event'; readonly event: AiEvent }
  | { readonly type: 'final'; readonly text: string }
  | { readonly type: 'error'; readonly message: string };

export interface CliEventMapper {
  map(line: unknown): readonly CliSignal[];
}

export function eventSignal(event: AiEvent): CliSignal {
  return { type: 'event', event };
}
