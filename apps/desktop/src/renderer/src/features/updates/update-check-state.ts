import type { UpdateStatus } from '@relay/shared';

export type SettledCheck = Extract<UpdateStatus, { kind: 'current' | 'error' }>;

export interface UpdateCheckState {
  readonly pending: boolean;
  readonly settled: SettledCheck | null;
}

export const IDLE_CHECK: UpdateCheckState = { pending: false, settled: null };

export const PENDING_CHECK: UpdateCheckState = { pending: true, settled: null };

const isSettled = (status: UpdateStatus | null): status is SettledCheck =>
  status?.kind === 'current' || status?.kind === 'error';

export const advanceCheck = (
  state: UpdateCheckState,
  status: UpdateStatus | null,
): UpdateCheckState => {
  if (status?.kind === 'checking') {
    return { pending: state.pending, settled: null };
  }
  if (state.pending && isSettled(status)) {
    return { pending: false, settled: status };
  }
  return IDLE_CHECK;
};
