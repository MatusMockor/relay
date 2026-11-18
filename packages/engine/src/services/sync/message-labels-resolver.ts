import type { AccountId, LabelId } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';

export interface LabelSource {
  readonly keywords: readonly string[];
  readonly labels: readonly string[] | null;
}

const DENIED_KEYWORDS: ReadonlySet<string> = new Set(['junk', 'nonjunk', 'notjunk']);

const isUserKeyword = (keyword: string): boolean => {
  const trimmed = keyword.trim();
  if (trimmed === '' || trimmed.startsWith('\\') || trimmed.startsWith('$')) {
    return false;
  }
  return !DENIED_KEYWORDS.has(trimmed.toLowerCase());
};

const isUserLabel = (label: string): boolean => label.trim() !== '' && !label.startsWith('\\');

export class MessageLabelsResolver {
  constructor(private readonly ids: IdGenerator) {}

  resolve(labels: LabelRepository, accountId: AccountId, source: LabelSource): Promise<LabelId[]> {
    if (source.labels !== null) {
      return this.gmailLabels(labels, accountId, source.labels);
    }
    return this.keywordLabels(labels, accountId, source.keywords);
  }

  private async gmailLabels(
    labels: LabelRepository,
    accountId: AccountId,
    names: readonly string[],
  ): Promise<LabelId[]> {
    const resolved: LabelId[] = [];
    for (const name of new Set(names.filter(isUserLabel))) {
      const label = await labels.findByRemoteName(accountId, 'gmail', name);
      if (label !== null) {
        resolved.push(label.id);
      }
    }
    return resolved;
  }

  private async keywordLabels(
    labels: LabelRepository,
    accountId: AccountId,
    keywords: readonly string[],
  ): Promise<LabelId[]> {
    const resolved: LabelId[] = [];
    for (const keyword of new Set(keywords.filter(isUserKeyword))) {
      const known = await labels.findByRemoteName(accountId, 'keyword', keyword);
      const label =
        known ??
        (await labels.upsert({
          id: this.ids.generate('label'),
          accountId,
          name: keyword,
          color: null,
          kind: 'keyword',
          remoteName: keyword,
        }));
      resolved.push(label.id);
    }
    return resolved;
  }
}
