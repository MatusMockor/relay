import type { EntityIdMap, EntityKind } from '@relay/shared/domain';

export interface IdGenerator {
  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind];
}
