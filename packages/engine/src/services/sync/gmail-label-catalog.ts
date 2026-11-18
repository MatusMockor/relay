import type { Label, Mailbox } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { Logger } from '../../ports/logger';
import type { LabelRescans } from './label-rescans';
import type { SyncContext } from './sync-context';
import { isValidLabel } from './valid-label';

export interface LabelRename {
  readonly from: string;
  readonly to: string;
}

export interface GmailLabelCatalogDeps {
  readonly labels: LabelRepository;
  readonly rescans: LabelRescans;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export class GmailLabelCatalog {
  constructor(private readonly deps: GmailLabelCatalogDeps) {}

  async sync(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    renames: readonly LabelRename[],
  ): Promise<boolean> {
    const accountId = context.account.id;
    const renamed = await this.rename(context, renames);
    const paths = new Set(mailboxes.filter((m) => m.role === 'label').map((m) => m.path));
    const existing = await this.deps.labels.listByKind(accountId, 'gmail');
    const known = new Set(existing.map((label) => label.remoteName));
    const added = await this.addAll(
      context,
      [...paths].filter((path) => !known.has(path)),
    );
    const stale = existing.filter((label) => !paths.has(label.remoteName));
    for (const label of stale) {
      await this.deps.labels.delete(context.userId, label.id);
    }
    return renamed || added || stale.length > 0;
  }

  private async addAll(context: SyncContext, paths: readonly string[]): Promise<boolean> {
    const labels: (Label | null)[] = [];
    for (const path of paths) {
      labels.push(await this.adoptable(context, path));
    }
    const valid = labels.filter((label): label is Label => label !== null);
    if (valid.length === 0) {
      return false;
    }
    await this.deps.rescans.mark(context.account.id);
    for (const label of valid) {
      await this.deps.labels.upsert(label);
    }
    return true;
  }

  private async rename(context: SyncContext, renames: readonly LabelRename[]): Promise<boolean> {
    const accountId = context.account.id;
    let renamed = false;
    for (const rename of renames) {
      const label = await this.deps.labels.findByRemoteName(accountId, 'gmail', rename.from);
      if (label === null) {
        continue;
      }
      const next: Label = { ...label, name: rename.to, remoteName: rename.to };
      if (!isValidLabel(next)) {
        continue;
      }
      await this.dropNameClash(context, rename.to, label);
      await this.deps.labels.upsert(next);
      renamed = true;
    }
    return renamed;
  }

  private async adoptable(context: SyncContext, path: string): Promise<Label | null> {
    const accountId = context.account.id;
    const sameName = await this.deps.labels.findByName(accountId, path);
    const label: Label = {
      id: sameName?.id ?? this.deps.ids.generate('label'),
      accountId,
      name: path,
      color: sameName?.color ?? null,
      kind: 'gmail',
      remoteName: path,
    };
    if (isValidLabel(label)) {
      return label;
    }
    this.deps.logger.warn('Skipping a Gmail label Relay cannot store', {
      accountId,
      length: path.length,
    });
    return null;
  }

  private async dropNameClash(context: SyncContext, name: string, keep: Label): Promise<void> {
    const clash = await this.deps.labels.findByName(context.account.id, name);
    if (clash === null || clash.id === keep.id) {
      return;
    }
    await this.deps.labels.delete(context.userId, clash.id);
  }
}
