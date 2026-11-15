import type { LabelListQuery } from '@relay/shared/api';
import type { Label, UserId } from '@relay/shared/domain';
import type { LabelRepository } from '../../ports/label-repository';

export class LabelQueryService {
  constructor(private readonly labels: LabelRepository) {}

  list(userId: UserId, query: LabelListQuery = {}): Promise<Label[]> {
    return this.labels.list(userId, query.accountId ?? null);
  }
}
