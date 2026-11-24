import { useMemo } from 'react';
import { useTasks } from '../../data/hooks/use-mail-queries';
import { threadTaskIndex, type ThreadTaskIndex } from './thread-priorities';

export const useThreadTaskIndex = (): ThreadTaskIndex => {
  const tasks = useTasks();
  return useMemo(() => threadTaskIndex(tasks.data?.items ?? []), [tasks.data]);
};
