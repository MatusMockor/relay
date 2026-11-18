import type { Label, Mailbox } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { SyncContext } from './sync-context';

export interface LabelRename {
  readonly from: string;
  readonly to: string;
}

export interface CatalogChange {
  readonly changed: boolean;
  readonly added: boolean;
}

export interface GmailLabelCatalogDeps {
  readonly labels: LabelRepository;
  readonly ids: IdGenerator;
}

export class GmailLabelCatalog {
  constructor(private readonly deps: GmailLabelCatalogDeps) {}

  async sync(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    renames: readonly LabelRename[],
  ): Promise<CatalogChange> {
    const accountId = context.account.id;
    const renamed = await this.rename(context, renames);
    const paths = new Set(mailboxes.filter((m) => m.role === 'label').map((m) => m.path));
    const existing = await this.deps.labels.listByKind(accountId, 'gmail');
    const known = new Set(existing.map((label) => label.remoteName));
    let added = false;
    for (const path of [...paths].filter((candidate) => !known.has(candidate))) {
      await this.adopt(accountId, path);
      added = true;
    }
    const stale = existing.filter((label) => !paths.has(label.remoteName));
    for (const label of stale) {
      await this.deps.labels.delete(context.userId, label.id);
    }
    return { changed: renamed || added || stale.length > 0, added };
  }

  private async rename(context: SyncContext, renames: readonly LabelRename[]): Promise<boolean> {
    const accountId = context.account.id;
    let renamed = false;
    for (const rename of renames) {
      const label = await this.deps.labels.findByRemoteName(accountId, 'gmail', rename.from);
      if (label === null) {
        continue;
      }
      await this.dropNameClash(context, rename.to, label);
      await this.deps.labels.upsert({ ...label, name: rename.to, remoteName: rename.to });
      renamed = true;
    }
    return renamed;
  }

  private async adopt(accountId: Label['accountId'], path: string): Promise<void> {
    const sameName = await this.deps.labels.findByName(accountId, path);
    await this.deps.labels.upsert({
      id: sameName?.id ?? this.deps.ids.generate('label'),
      accountId,
      name: path,
      color: sameName?.color ?? null,
      kind: 'gmail',
      remoteName: path,
    });
  }

  private async dropNameClash(context: SyncContext, name: string, keep: Label): Promise<void> {
    const clash = await this.deps.labels.findByName(context.account.id, name);
    if (clash === null || clash.id === keep.id) {
      return;
    }
    await this.deps.labels.delete(context.userId, clash.id);
  }
}
