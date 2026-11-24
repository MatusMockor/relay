import type { TaskSystemConnection } from '@relay/shared/domain';
import type { TaskSystemConnectionRecord } from '../../model/task-system';

export const toTaskSystemConnection = ({
  externalAccountId: _externalAccountId,
  ...connection
}: TaskSystemConnectionRecord): TaskSystemConnection => connection;
