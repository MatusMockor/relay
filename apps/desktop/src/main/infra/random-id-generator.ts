import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@relay/engine';
import type { EntityIdMap, EntityKind } from '@relay/shared/domain';

const PREFIXES: Readonly<Record<EntityKind, string>> = {
  user: 'usr',
  device: 'dev',
  account: 'acc',
  mailbox: 'mbx',
  thread: 'thr',
  message: 'msg',
  attachment: 'att',
  label: 'lbl',
  split: 'spl',
  task: 'tsk',
  reminder: 'rem',
  draft: 'drf',
  scheduledSend: 'sch',
  aiJob: 'aij',
  aiResult: 'air',
  calendarEvent: 'cev',
  calendarSubscription: 'csb',
  calendarConnection: 'ccn',
  googleCalendar: 'gcl',
};

export class RandomIdGenerator implements IdGenerator {
  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] {
    return `${PREFIXES[kind]}_${randomUUID().replaceAll('-', '')}` as EntityIdMap[Kind];
  }
}
