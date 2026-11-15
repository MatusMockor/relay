import type { AccountId, LabelId } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';

const isUserKeyword = (keyword: string): boolean =>
  keyword.trim() !== '' && !keyword.startsWith('\\') && !keyword.startsWith('$');

export class KeywordLabels {
  constructor(private readonly ids: IdGenerator) {}

  async resolve(
    labels: LabelRepository,
    accountId: AccountId,
    keywords: readonly string[],
  ): Promise<LabelId[]> {
    const resolved: LabelId[] = [];
    for (const keyword of new Set(keywords.filter(isUserKeyword))) {
      const known = await labels.findByName(accountId, keyword);
      const label =
        known ??
        (await labels.upsert({
          id: this.ids.generate('label'),
          accountId,
          name: keyword,
          color: null,
        }));
      resolved.push(label.id);
    }
    return resolved;
  }
}
