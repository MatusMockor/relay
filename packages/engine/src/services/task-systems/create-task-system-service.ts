import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import { TaskSystemConnector } from './task-system-connector';
import { TaskSystemService } from './task-system-service';
import { TaskSystemTaskReader } from './task-system-task-reader';
import { UNCONFIGURED_TASK_SYSTEMS } from './unconfigured-task-systems';

export const createTaskSystemService = (
  deps: Pick<EngineDeps, 'repositories' | 'taskSystems' | 'clock' | 'idGenerator'>,
  events: EngineEvents,
): TaskSystemService => {
  const shared = {
    connections: deps.repositories.taskSystemConnections,
    adapters: deps.taskSystems ?? UNCONFIGURED_TASK_SYSTEMS,
    events,
    clock: deps.clock,
  };
  return new TaskSystemService({
    connections: shared.connections,
    connector: new TaskSystemConnector({ ...shared, ids: deps.idGenerator }),
    tasks: new TaskSystemTaskReader(shared),
  });
};
