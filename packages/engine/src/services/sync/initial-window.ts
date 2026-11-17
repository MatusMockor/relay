import type { RemoteThreadHeaders } from '../../model/remote-mail';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';

const DAY_MS = 86_400_000;

export interface WindowEntry {
  readonly pass: MailboxPass;
  readonly uid: number;
  readonly arrivedAt: number;
  readonly messageId: string | null;
  readonly parentIds: readonly string[];
  readonly subject: string;
  readonly sentAt: string;
  readonly wanted: boolean;
}

export interface MailboxWindow {
  readonly pass: MailboxPass;
  readonly frozen: InitialSyncWindow;
  readonly topUid: number;
  readonly entries: readonly WindowEntry[];
  readonly done: number;
  readonly total: number;
}

export interface InitialWindowDeps {
  readonly messages: MessageRepository;
  readonly clock: Clock;
  readonly options: SyncOptions;
}

type RankedEntry = WindowEntry & { readonly recent: boolean };

const selectUids = (uids: readonly number[], pass: MailboxPass, limit: number): number[] => {
  const frozen = pass.state?.initialWindow ?? null;
  if (frozen === null) {
    return uids.slice(Math.max(0, uids.length - limit));
  }
  return uids.filter((uid) => uid >= frozen.floorUid);
};

const freeze = (
  pass: MailboxPass,
  selected: readonly number[],
  deps: InitialWindowDeps,
): InitialSyncWindow => {
  const cutoff = deps.clock.now().getTime() - deps.options.initialWindowDays * DAY_MS;
  return (
    pass.state?.initialWindow ?? {
      floorUid: selected[0] ?? pass.status.uidNext,
      cutoff: new Date(cutoff).toISOString(),
    }
  );
};

const cutoffOf = (pass: MailboxPass, frozen: InitialSyncWindow): number => {
  if (pass.role === 'trash') {
    return Number.NEGATIVE_INFINITY;
  }
  return Date.parse(frozen.cutoff);
};

export const windowEntry = (
  pass: MailboxPass,
  header: RemoteThreadHeaders,
  wanted: boolean,
): WindowEntry => {
  const arrivedAt = Date.parse(header.internalDate);
  return {
    pass,
    uid: header.uid,
    arrivedAt: Number.isNaN(arrivedAt) ? 0 : arrivedAt,
    messageId: header.messageId,
    parentIds: [...header.inReplyTo, ...header.references],
    subject: header.subject,
    sentAt: header.date,
    wanted,
  };
};

const toEntry = (
  pass: MailboxPass,
  header: RemoteThreadHeaders,
  cutoff: number,
  stored: ReadonlySet<number>,
): RankedEntry => {
  const recent = Date.parse(header.internalDate) >= cutoff;
  return { ...windowEntry(pass, header, recent && !stored.has(header.uid)), recent };
};

export const mailboxWindow = async (
  context: SyncContext,
  pass: MailboxPass,
  deps: InitialWindowDeps,
): Promise<MailboxWindow> => {
  const { path } = pass.mailbox;
  const uids = await context.provider.listUids(path);
  const selected = selectUids(uids, pass, deps.options.initialMessageLimit);
  const frozen = freeze(pass, selected, deps);
  const headers = await context.provider.fetchThreadHeaders(
    path,
    pass.status.uidValidity,
    selected,
  );
  const stored = new Set(await deps.messages.listUids(pass.mailbox.id));
  const cutoff = cutoffOf(pass, frozen);
  const entries = headers.map((header) => toEntry(pass, header, cutoff, stored));
  const recent = entries.filter((entry) => entry.recent);
  return {
    pass,
    frozen,
    topUid: Math.max(selected.at(-1) ?? 0, frozen.floorUid - 1),
    entries,
    done: recent.filter((entry) => !entry.wanted).length,
    total: recent.length,
  };
};
