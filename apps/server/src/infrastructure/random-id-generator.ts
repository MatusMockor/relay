import { randomBytes } from 'node:crypto';
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
};

export class RandomIdGenerator implements IdGenerator {
  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] {
    const time = Date.now().toString(36).padStart(9, '0');
    const random = randomBytes(12).toString('base64url');
    return `${PREFIXES[kind]}_${time}${random}` as EntityIdMap[Kind];
  }
}
