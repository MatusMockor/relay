import type { ExternalTask } from '@relay/shared';
import { useAppContext } from '../../data/hooks/services-context';
import { selectKey } from '../mail/selection';
import { taskKeyOf } from './open-tasks';

export const useOpenTask = (): ((task: ExternalTask) => void) => {
  const { platform } = useAppContext();
  return (task) => {
    selectKey(taskKeyOf(task));
    platform.openExternal(task.url);
  };
};
