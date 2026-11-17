import type { RemoteThreadHeaders } from '../../model/remote-mail';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';

const DAY_MS = 86_400_000;

export interface WindowEntry {
  readonly pass: MailboxPass;
  readonly uid: number;
  readonly date: number;
  readonly ids: readonly string[];
  readonly wanted: boolean;
}

export interface MailboxWindow {
  readonly pass: MailboxPass;
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

const linkedIds = (headers: RemoteThreadHeaders): string[] => [
  ...(headers.messageId === null ? [] : [headers.messageId]),
  ...headers.inReplyTo,
  ...headers.references,
];

export const mailboxWindow = async (
  context: SyncContext,
  pass: MailboxPass,
  deps: InitialWindowDeps,
): Promise<MailboxWindow> => {
  const { path } = pass.mailbox;
  const uids = await context.provider.listUids(path);
  const window = uids.slice(Math.max(0, uids.length - deps.options.initialMessageLimit));
  const headers = await context.provider.fetchThreadHeaders(path, pass.status.uidValidity, window);
  const stored = new Set(await deps.messages.listUids(pass.mailbox.id));
  const cutoff = deps.clock.now().getTime() - deps.options.initialWindowDays * DAY_MS;
  const entries = headers.map((header): WindowEntry & { readonly recent: boolean } => {
    const date = Date.parse(header.internalDate);
    const recent = date >= cutoff;
    return {
      pass,
      uid: header.uid,
      date: Number.isNaN(date) ? 0 : date,
      ids: linkedIds(header),
      recent,
      wanted: recent && !stored.has(header.uid),
    };
  });
  const recent = entries.filter((entry) => entry.recent);
  return {
    pass,
    topUid: window.at(-1) ?? 0,
    entries,
    done: recent.filter((entry) => !entry.wanted).length,
    total: recent.length,
  };
};
