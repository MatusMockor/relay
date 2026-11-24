import type { TaskSystemConnectionId, TaskSystemProvider, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors/errors';
import type { TaskSystemConnectionRecord } from '../../model/task-system';
import type { TaskSystemAdapter } from '../../ports/task-system-adapter';
import type { TaskSystemAdapters } from '../../ports/task-system-adapters';
import type { TaskSystemConnectionRepository } from '../../ports/task-system-connection-repository';
import type { Clock } from '../../ports/clock';
import type { EngineEvents } from '../shared/engine-events';

export interface TaskSystemServiceDeps {
  readonly connections: TaskSystemConnectionRepository;
  readonly adapters: TaskSystemAdapters;
  readonly events: EngineEvents;
  readonly clock: Clock;
}

export const adapterFor = (
  adapters: TaskSystemAdapters,
  provider: TaskSystemProvider,
): TaskSystemAdapter => {
  const adapter = adapters.registry.get(provider);
  if (adapter === null) {
    throw new ValidationError('Tento systém úloh zatiaľ nie je podporovaný.');
  }
  return adapter;
};

export const ownedConnection = async (
  connections: TaskSystemConnectionRepository,
  userId: UserId,
  id: TaskSystemConnectionId,
): Promise<TaskSystemConnectionRecord> => {
  const record = await connections.findById(userId, id);
  if (record === null) {
    throw new NotFoundError('Task system connection', id);
  }
  return record;
};
