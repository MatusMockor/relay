import type { AccountId, Label, LabelId } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { Repositories } from '../../ports/repositories';
import { decodeKeyword, keywordKey } from '../labels/keyword-codec';
import { isUserKeyword } from '../shared/user-keyword';
import { isValidLabel } from './valid-label';

export interface LabelSource {
  readonly keywords: readonly string[];
  readonly labels: readonly string[] | null;
}

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
    const wanted = keywords.filter(isUserKeyword);
    if (wanted.length === 0) {
      return [];
    }
    const known = await stores.labels.listByKind(accountId, 'keyword');
    const byKey = new Map(known.map((label) => [keywordKey(label.remoteName), label]));
    const resolved = new Set<LabelId>();
    for (const keyword of wanted) {
      const key = keywordKey(keyword);
      const label = byKey.get(key) ?? (await this.adopted(stores, accountId, keyword));
      if (label !== null) {
        byKey.set(key, label);
        resolved.add(label.id);
      }
    }
    return [...resolved];
  }

  private async adopted(
    stores: LabelStores,
    accountId: AccountId,
    keyword: string,
  ): Promise<Label | null> {
    const ref = keywordKey(keyword);
    const purge = await stores.pendingWork.find({ accountId, kind: 'keyword-purge', ref });
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
      name: await this.freeName(labels, accountId, decodeKeyword(keyword)),
      color: null,
      kind: 'keyword',
      remoteName: keyword,
    };
    return isValidLabel(label) ? labels.upsert(label) : null;
  }

  private async freeName(
    labels: LabelRepository,
    accountId: AccountId,
    base: string,
  ): Promise<string> {
    for (let suffix = 1; ; suffix += 1) {
      const name = suffix === 1 ? base : `${base} (${String(suffix)})`;
      if ((await labels.findByName(accountId, name)) === null) {
        return name;
      }
    }
  }
}
