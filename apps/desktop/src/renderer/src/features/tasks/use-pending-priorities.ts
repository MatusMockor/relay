import { type PendingPriorities, usePendingPriorityStore } from './pending-priorities';

export const usePendingPriorities = (): PendingPriorities =>
  usePendingPriorityStore((state) => state.pending);
