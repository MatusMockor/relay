import type { AccountId, Label, LabelId } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { Repositories } from '../../ports/repositories';
import { isValidLabel } from './valid-label';

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

type LabelStores = Pick<Repositories, 'labels' | 'pendingWork'>;

const isUserLabel = (label: string): boolean => label.trim() !== '' && !label.startsWith('\\');

export class MessageLabelsResolver {
  constructor(private readonly ids: IdGenerator) {}

  resolve(stores: LabelStores, accountId: AccountId, source: LabelSource): Promise<LabelId[]> {
    if (source.labels !== null) {
      return this.gmailLabels(stores.labels, accountId, source.labels);
    }
    return this.keywordLabels(stores, accountId, source.keywords);
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
    stores: LabelStores,
    accountId: AccountId,
    keywords: readonly string[],
  ): Promise<LabelId[]> {
    const resolved: LabelId[] = [];
    for (const keyword of new Set(keywords.filter(isUserKeyword))) {
      const known = await stores.labels.findByRemoteName(accountId, 'keyword', keyword);
      const label = known ?? (await this.adopted(stores, accountId, keyword));
      if (label !== null) {
        resolved.push(label.id);
      }
    }
    return resolved;
  }

  private async adopted(
    stores: LabelStores,
    accountId: AccountId,
    keyword: string,
  ): Promise<Label | null> {
    const purge = await stores.pendingWork.find({ accountId, kind: 'keyword-purge', ref: keyword });
    return purge === null ? this.created(stores.labels, accountId, keyword) : null;
  }

  private async created(
    labels: LabelRepository,
    accountId: AccountId,
    keyword: string,
  ): Promise<Label | null> {
    const label: Label = {
      id: this.ids.generate('label'),
      accountId,
      name: await this.freeName(labels, accountId, keyword),
      color: null,
      kind: 'keyword',
      remoteName: keyword,
    };
    return isValidLabel(label) ? labels.upsert(label) : null;
  }

  private async freeName(
    labels: LabelRepository,
    accountId: AccountId,
    keyword: string,
  ): Promise<string> {
    for (let suffix = 1; ; suffix += 1) {
      const name = suffix === 1 ? keyword : `${keyword} (${String(suffix)})`;
      if ((await labels.findByName(accountId, name)) === null) {
        return name;
      }
    }
  }
}
