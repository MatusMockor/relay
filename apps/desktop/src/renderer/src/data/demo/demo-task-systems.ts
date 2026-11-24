import type {
  ConnectTaskSystemInput,
  RealtimeEvent,
  TaskSystemConnection,
  TaskSystemConnectionId,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { TaskSystemClient } from '../TaskSystemClient';
import {
  DEMO_JIRA_ACCOUNT,
  DEMO_JIRA_EMAIL,
  DEMO_JIRA_SITE,
  type DemoConnectionRecord,
  demoConnection,
  demoConnectionId,
  demoSiteUrl,
  demoTicket,
  rejectedToken,
} from './demo-task-system-data';
import { DEMO_NEW_TICKETS, DEMO_TICKETS } from './seed/task-system-tickets';

export interface DemoTaskSystemsOptions {
  readonly connected?: boolean;
  readonly tokenRejected?: boolean;
  readonly empty?: boolean;
  readonly truncated?: boolean;
}

const seedRecords = (now: Date, options: DemoTaskSystemsOptions): DemoConnectionRecord[] => {
  if (options.connected === false) {
    return [];
  }
  const fields = { label: 'Acme Jira', siteUrl: DEMO_JIRA_SITE, accountName: DEMO_JIRA_ACCOUNT };
  const connection = demoConnection(demoConnectionId(1), fields, now.toISOString());
  const tickets = options.empty === true ? [] : DEMO_TICKETS;
  return [{ connection, email: DEMO_JIRA_EMAIL, tickets }];
};

const notFound = () => new MailClientError({ code: 'not_found', message: 'Pripojenie neexistuje' });

const run = <T>(work: () => T): Promise<T> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

export const createDemoTaskSystems = (
  now: () => Date,
  emit: (event: RealtimeEvent) => void,
  options: DemoTaskSystemsOptions = {},
): TaskSystemClient => {
  let records = seedRecords(now(), options);
  let created = records.length;
  const updated = (connectionId: TaskSystemConnectionId) => {
    emit({ type: 'taskSystems.updated', at: now().toISOString(), data: { connectionId } });
  };
  const find = (connectionId: TaskSystemConnectionId): DemoConnectionRecord => {
    const found = records.find((record) => record.connection.id === connectionId);
    if (found === undefined) {
      throw notFound();
    }
    return found;
  };
  const save = (record: DemoConnectionRecord, patch: Partial<TaskSystemConnection>) => {
    const connection = { ...record.connection, ...patch, updatedAt: now().toISOString() };
    records = records.map((item) => (item === record ? { ...record, connection } : item));
    updated(connection.id);
    return connection;
  };
  const reject = (record: DemoConnectionRecord): never => {
    const error = rejectedToken();
    if (record.connection.status === 'ok') {
      save(record, { status: 'error', lastError: error.message });
    }
    throw error;
  };
  const connect = (input: ConnectTaskSystemInput): TaskSystemConnection => {
    const siteUrl = demoSiteUrl(input.siteUrl);
    if (options.tokenRejected === true) {
      throw rejectedToken();
    }
    const existing = records.find(
      (record) => record.connection.siteUrl === siteUrl && record.email === input.email,
    );
    if (existing !== undefined) {
      const label = input.label ?? existing.connection.label;
      return save(existing, { label, status: 'ok', lastError: null });
    }
    created += 1;
    const label = input.label ?? new URL(siteUrl).host;
    const fields = { label, siteUrl, accountName: input.email };
    const connection = demoConnection(demoConnectionId(created), fields, now().toISOString());
    records = [...records, { connection, email: input.email, tickets: DEMO_NEW_TICKETS }];
    updated(connection.id);
    return connection;
  };
  return {
    listTaskSystems: () => Promise.resolve(records.map((record) => record.connection)),
    connectTaskSystem: (input) => run(() => connect(input)),
    disconnectTaskSystem: (connectionId) =>
      run(() => {
        find(connectionId);
        records = records.filter((record) => record.connection.id !== connectionId);
        updated(connectionId);
      }),
    listTaskSystemTasks: (connectionId) =>
      run(() => {
        const record = find(connectionId);
        if (options.tokenRejected === true) {
          return reject(record);
        }
        const items = record.tickets.map((seed) => demoTicket(record, seed, now()));
        return { items, truncated: options.truncated === true };
      }),
  };
};
