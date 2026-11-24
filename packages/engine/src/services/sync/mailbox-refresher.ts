import type { Mailbox } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { GmailLabelCatalog, LabelRename } from './gmail-label-catalog';
import type { MailboxEvents } from './mailbox-events';
import type { MailboxForgetter } from './mailbox-forgetter';
import { mailboxRecords, sameMailboxes } from './mailbox-records';
import { detectRenames, type MailboxRename } from './mailbox-rename-detector';
import type { MailboxStatusProbe, MailboxStatuses } from './mailbox-status-probe';
import type { SyncContext } from './sync-context';

export interface MailboxRefresherDeps {
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly forgetter: MailboxForgetter;
  readonly probe: MailboxStatusProbe;
  readonly catalog: GmailLabelCatalog;
  readonly events: MailboxEvents;
  readonly ids: IdGenerator;
}

const relocated = (mailbox: Mailbox, renames: readonly MailboxRename[]): Mailbox => {
  const rename = renames.find((candidate) => candidate.mailbox.id === mailbox.id);
  return rename === undefined ? mailbox : { ...mailbox, path: rename.target.path };
};

const labelRenames = (renames: readonly MailboxRename[]): LabelRename[] =>
  renames
    .filter(({ mailbox, target }) => mailbox.role === 'label' || target.role === 'label')
    .map(({ mailbox, target }) => ({ from: mailbox.path, to: target.path }));

export class MailboxRefresher {
  constructor(private readonly deps: MailboxRefresherDeps) {}

  async refresh(context: SyncContext): Promise<Mailbox[]> {
    const accountId = context.account.id;
    const existing = await this.deps.mailboxes.listForSync(accountId);
    const remote = await context.provider.listMailboxes();
    const statuses = await this.probe(context, existing, remote);
    const renames = await this.relocate(context, existing, remote, statuses);
    const located = existing.map((mailbox) => relocated(mailbox, renames));
    const remotePaths = new Set(remote.map((mailbox) => mailbox.path));
    for (const gone of located.filter((mailbox) => !remotePaths.has(mailbox.path))) {
      await this.deps.forgetter.forget(context, gone);
    }
    const known = new Map(located.map((mailbox) => [mailbox.path, mailbox]));
    const stored = await this.deps.mailboxes.upsertMany(
      accountId,
      mailboxRecords({ accountId, remote, known, statuses }, this.deps.ids),
    );
    const appeared = await this.appearedSince(context, located, remotePaths);
    await this.deps.mailboxes.deleteMissing(accountId, [
      ...remotePaths,
      ...appeared.map((mailbox) => mailbox.path),
    ]);
    const current = [...stored, ...appeared];
    context.mailboxRoles.clear();
    current.forEach((mailbox) => context.mailboxRoles.set(mailbox.id, mailbox.role));
    const labelsChanged = await this.deps.catalog.sync(context, current, labelRenames(renames));
    await this.announce(context, sameMailboxes(existing, current), labelsChanged);
    return current;
  }

  private probe(
    context: SyncContext,
    existing: readonly Mailbox[],
    remote: readonly RemoteMailbox[],
  ): Promise<MailboxStatuses> {
    const remotePaths = new Set(remote.map((mailbox) => mailbox.path));
    if (existing.every((mailbox) => remotePaths.has(mailbox.path))) {
      return Promise.resolve(new Map());
    }
    const existingPaths = new Set(existing.map((mailbox) => mailbox.path));
    const appeared = [...remotePaths].filter((path) => !existingPaths.has(path));
    return this.deps.probe.probe(context, appeared);
  }

  private async relocate(
    context: SyncContext,
    existing: readonly Mailbox[],
    remote: readonly RemoteMailbox[],
    statuses: MailboxStatuses,
  ): Promise<MailboxRename[]> {
    const remotePaths = new Set(remote.map((mailbox) => mailbox.path));
    const existingPaths = new Set(existing.map((mailbox) => mailbox.path));
    const gone = existing.filter((mailbox) => !remotePaths.has(mailbox.path));
    const appeared = remote.filter((mailbox) => !existingPaths.has(mailbox.path));
    if (gone.length === 0 || appeared.length === 0) {
      return [];
    }
    const states = await this.deps.syncStates.listByAccount(context.account.id);
    const syncedValidity = new Map(states.map((state) => [state.mailboxId, state.uidValidity]));
    const renames = detectRenames({ gone, appeared, statuses, syncedValidity });
    for (const { mailbox, target } of renames) {
      await this.deps.mailboxes.relocate(mailbox.id, {
        path: target.path,
        name: target.name,
        delimiter: target.delimiter,
      });
    }
    return renames;
  }

  private async announce(
    context: SyncContext,
    sameMailboxSet: boolean,
    labelsChanged: boolean,
  ): Promise<void> {
    if (!sameMailboxSet) {
      await this.deps.events.mailboxesChanged(context);
    }
    if (labelsChanged) {
      await this.deps.events.labelsChanged(context);
    }
  }

  private async appearedSince(
    context: SyncContext,
    snapshot: readonly Mailbox[],
    remotePaths: ReadonlySet<string>,
  ): Promise<Mailbox[]> {
    const known = new Set(snapshot.map((mailbox) => mailbox.path));
    const latest = await this.deps.mailboxes.listForSync(context.account.id);
    return latest.filter((mailbox) => !known.has(mailbox.path) && !remotePaths.has(mailbox.path));
  }
}
