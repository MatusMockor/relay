import type {
  ConnectTaskSystemInput,
  RealtimeEvent,
  TaskSystemConnection,
  TaskSystemConnectionId,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { TaskSystemClient } from '../TaskSystemClient';
import { DEMO_ACCOUNT_NAME, DEMO_LINEAR_SITE, demoAccountOf } from './demo-task-system-accounts';
import {
  DEMO_JIRA_ACCOUNT,
  DEMO_JIRA_EMAIL,
  DEMO_JIRA_SITE,
  type DemoConnectionRecord,
  demoConnection,
  demoConnectionId,
  demoTicket,
  rejectedToken,
} from './demo-task-system-data';
import { DEMO_TICKETS } from './seed/task-system-tickets';
import { DEMO_LINEAR_TICKETS } from './seed/task-system-tickets-more';

export interface DemoTaskSystemsOptions {
  readonly connected?: boolean;
  readonly linear?: boolean;
  readonly tokenRejected?: boolean;
  readonly empty?: boolean;
  readonly truncated?: boolean;
}

const seedRecords = (now: Date, options: DemoTaskSystemsOptions): DemoConnectionRecord[] => {
  if (options.connected === false) {
    return [];
  }
  const at = now.toISOString();
  const ticketsOf = (seeds: DemoConnectionRecord['tickets']) =>
    options.empty === true ? [] : seeds;
  const jira = demoConnection(
    demoConnectionId(1),
    {
      provider: 'jira',
      label: 'Acme Jira',
      siteUrl: DEMO_JIRA_SITE,
      accountName: DEMO_JIRA_ACCOUNT,
    },
    at,
  );
  const records = [
    { connection: jira, account: DEMO_JIRA_EMAIL, tickets: ticketsOf(DEMO_TICKETS) },
  ];
  if (options.linear === false) {
    return records;
  }
  const linear = demoConnection(
    demoConnectionId(2),
    {
      provider: 'linear',
      label: 'Acme Linear',
      siteUrl: DEMO_LINEAR_SITE,
      accountName: DEMO_ACCOUNT_NAME,
    },
    at,
  );
  return [
    ...records,
    { connection: linear, account: 'linear-jan', tickets: ticketsOf(DEMO_LINEAR_TICKETS) },
  ];
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
  let created = Math.max(records.length, 2);
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
    const error = rejectedToken(record.connection.provider);
    if (record.connection.status === 'ok') {
      save(record, { status: 'error', lastError: error.message });
    }
    throw error;
  };
  const connect = (input: ConnectTaskSystemInput): TaskSystemConnection => {
    const account = demoAccountOf(input);
    if (options.tokenRejected === true) {
      throw rejectedToken(input.provider);
    }
    const existing = records.find(
      ({ connection, account: known }) =>
        connection.provider === input.provider &&
        connection.siteUrl === account.siteUrl &&
        known === account.account,
    );
    if (existing !== undefined) {
      const label = input.label ?? existing.connection.label;
      return save(existing, { label, status: 'ok', lastError: null });
    }
    created += 1;
    const fields = {
      provider: input.provider,
      label: input.label ?? account.defaultLabel,
      siteUrl: account.siteUrl,
      accountName: account.accountName,
    };
    const connection = demoConnection(demoConnectionId(created), fields, now().toISOString());
    records = [...records, { connection, account: account.account, tickets: account.tickets }];
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
